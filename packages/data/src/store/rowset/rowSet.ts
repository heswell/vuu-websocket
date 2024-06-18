/**
 * Keep all except for groupRowset in this file to avoid circular reference warnings
 */
import { TableColumn } from "@heswell/server-types";
import { VuuSortCol } from "@vuu-ui/data-types";
import { Filter } from "@vuu-ui/utils";
import {
  ColumnMap,
  ColumnMetaData,
  metaData,
  projectColumns,
} from "../columnUtils.js";
import {
  SET_FILTER_DATA_COLUMNS,
  extendsFilter,
  extractFilterForColumn,
  functor as filterPredicate,
  overrideColName,
  splitFilterOnColumn,
} from "../filter.js";
import {
  NULL_RANGE,
  Range,
  getDeltaRange,
  getFullRange,
} from "../rangeUtils.js";
import { addRowsToIndex, arrayOfIndices } from "../rowUtils.js";
import SelectionModel, { SelectionModelType } from "../selection-model.js";
import {
  SortSet,
  mapSortDefsToSortCriteria,
  sort,
  sortBy,
  sortExtend,
  sortExtendsExistingSort,
  sortPosition,
  sortReversed,
  sortableFilterSet,
} from "../sortUtils.js";
import { Row } from "../storeTypes.js";
import { Table } from "../table.js";
import { DataTypes } from "../types.js";

const SINGLE_COLUMN = 1;

const NO_OPTIONS = {
  filter: null,
};

const NULL_SORTSET: SortSet = [[-1, -1, -1]];

export abstract class BaseRowSet {
  public range: Range = NULL_RANGE;

  protected columnMap: ColumnMap;
  protected meta: ColumnMetaData;
  protected sortCols: VuuSortCol[] | undefined;
  protected sortReverse: boolean = false;
  protected sortRequired: boolean = false;
  protected currentFilter: Filter | null = null;
  protected filterSet: any = null;
  protected sortSet: SortSet = NULL_SORTSET;

  private columns: TableColumn[];
  private offset = 0;
  private selected: {
    rows: any[];
    focusedIdx: number;
    lastTouchIdx: number;
  } = { rows: [], focusedIdx: -1, lastTouchIdx: -1 };
  private selectedRowsIDX: number[] = [];
  private selectionModel: SelectionModel;
  private table: Table;

  protected data: Row[];

  constructor(table: Table, columns: TableColumn[]) {
    this.table = table;
    this.columns = columns;
    this.columnMap = table.columnMap;
    this.meta = metaData(columns);
    this.data = table.rows;
    this.selected = { rows: [], focusedIdx: -1, lastTouchIdx: -1 };
    /**
     * data IDX of selected rows
     */
    this.selectionModel = this.createSelectionModel();
  }

  createSelectionModel() {
    return new SelectionModel();
  }

  // used by binned rowset
  get filteredData() {
    if (this.filterSet) {
      return this.filterSet;
    } else {
      const { IDX } = this.meta;
      return this.data.map((row: Row) => row[IDX]);
    }
  }

  get stats() {
    // TODO cache the stats and invalidate them in the event of any op that might change them
    const { totalRowCount, filteredRowCount, selected, selectedRowsIDX } = this;
    const totalSelected = selectedRowsIDX.length;
    const filteredSelected = selected.rows.length;

    return {
      totalRowCount,
      totalSelected,
      filteredRowCount,
      filteredSelected,
    };
  }

  get totalRowCount() {
    return this.data.length;
  }

  get filteredRowCount() {
    return this.filterSet === null ? this.data.length : this.filterSet.length;
  }

  get selectedRowCount() {
    return this.selected.rows.length;
  }

  // Must be implemented by sub class
  slice(from: number, to: number): any;

  setRange(range = this.range, useDelta = true, includeStats = false) {
    const { from, to } = useDelta
      ? getDeltaRange(this.range, range)
      : getFullRange(range);
    const resultset = this.slice(from, to);
    this.range = range;
    return {
      dataType: this.type,
      rows: resultset,
      range,
      size: this.size,
      offset: this.offset,
      stats: includeStats ? this.stats : undefined,
    };
  }

  currentRange() {
    const { lo, hi } = this.range;
    const resultset = this.slice(lo, hi);
    return {
      dataType: this.type,
      rows: resultset,
      range: this.range,
      size: this.size,
      offset: this.offset,
    };
  }

  select(idx, rangeSelect, keepExistingSelection) {
    const {
      meta: { SELECTED },
      selectionModel,
      range: { lo, hi },
      filterSet,
      sortSet,
      offset,
    } = this;

    const { selected, deselected, ...selectionState } = selectionModel.select(
      this.selected,
      idx,
      rangeSelect,
      keepExistingSelection
    );

    this.selected = selectionState;

    if (filterSet) {
      if (selected.length) {
        this.selectedRowsIDX.push(...selected.map((i) => filterSet[i]));
      }
      if (deselected.length) {
        const deselectedRowIDX = deselected.map((i) => filterSet[i]);
        this.selectedRowsIDX = this.selectedRowsIDX.filter(
          (rowIdx) => !deselectedRowIDX.includes(rowIdx)
        );
      }
    } else {
      const idxToIDX = (idx) => sortSet[idx][0];
      this.selectedRowsIDX = this.selected.rows.map(idxToIDX);
    }

    const updates = [];
    for (let i = 0; i < selected.length; i++) {
      const idx = selected[i];
      if (idx >= lo && idx < hi) {
        updates.push([idx + offset, SELECTED, 1]);
      }
    }
    for (let i = 0; i < deselected.length; i++) {
      const idx = deselected[i];
      if (idx >= lo && idx < hi) {
        updates.push([idx + offset, SELECTED, 0]);
      }
    }

    return updates;
  }

  selectAll() {
    const {
      data,
      selected,
      selectedRowsIDX,
      meta: { SELECTED },
      range: { lo, hi },
      filterSet,
      offset,
    } = this;
    const previouslySelectedRows = [...this.selected.rows];
    if (filterSet) {
      // selection of a filtered subset is added to existing selection
      for (let i = 0; i < filterSet.length; i++) {
        const rowIDX = filterSet[i];
        if (!selectedRowsIDX.includes(rowIDX)) {
          selected.rows.push(i); // does it matter if thes eend up out of sequence ?
          selectedRowsIDX.push(rowIDX);
        }
      }
    } else {
      // Step 1: brute force approach, actually create list of selected indices
      // need to replace this with a structure that tracks ranges
      this.selected = {
        rows: arrayOfIndices(data.length),
        focusedIdx: -1,
        lastTouchIdx: -1,
      };
      this.selectedRowsIDX = [...this.selected.rows];
    }

    const updates = [];
    const max = Math.min(hi, (filterSet || data).length);
    for (let i = lo; i < max; i++) {
      if (
        this.selected.rows.includes(i) &&
        !previouslySelectedRows.includes(i)
      ) {
        updates.push([i + offset, SELECTED, 1]);
      }
    }

    return updates;
  }

  selectNone() {
    const {
      meta: { SELECTED },
      range: { lo, hi },
      filterSet,
      offset,
    } = this;
    const previouslySelectedRows = this.selectedRowsIDX;
    if (filterSet) {
      this.selected = { rows: [], focusedIdx: -1, lastTouchIdx: -1 };
      this.selectedRowsIDX = this.selectedRowsIDX.filter(
        (idx) => !filterSet.includes(idx)
      );
    } else {
      this.selected = { rows: [], focusedIdx: -1, lastTouchIdx: -1 };
      this.selectedRowsIDX = [];
    }
    const updates = [];
    for (let i = lo; i < hi; i++) {
      const idx = filterSet ? filterSet[i] : i;
      if (previouslySelectedRows.includes(idx)) {
        updates.push([i + offset, SELECTED, 0]);
      }
    }
    return updates;
  }

  selectNavigationSet(useFilter) {
    const { COUNT, IDX_POINTER, FILTER_COUNT, NEXT_FILTER_IDX } = this.meta;
    return useFilter
      ? [this.filterSet, NEXT_FILTER_IDX, FILTER_COUNT]
      : [this.sortSet, IDX_POINTER, COUNT];
  }

  getDistinctValuesForColumn(column) {
    const { data: rows, columnMap, currentFilter } = this;
    const colIdx = columnMap[column.name];
    const resultMap = {};
    const data = [];
    const dataRowCount = rows.length;
    const [, /*columnFilter*/ otherFilters] = splitFilterOnColumn(
      currentFilter,
      column
    );
    // this filter for column that we remove will provide our selected values
    let dataRowAllFilters = 0;

    if (otherFilters === null) {
      let result;
      for (let i = 0; i < dataRowCount; i++) {
        const val = rows[i][colIdx];
        if ((result = resultMap[val])) {
          result[2] = ++result[1];
        } else {
          result = [val, 1, 1];
          resultMap[val] = result;
          data.push(result);
        }
      }
      dataRowAllFilters = dataRowCount;
    } else {
      const fn = filterPredicate(columnMap, otherFilters);
      let result;

      for (let i = 0; i < dataRowCount; i++) {
        const row = rows[i];
        const val = row[colIdx];
        const isIncluded = fn(row) ? 1 : 0;
        if ((result = resultMap[val])) {
          result[1] += isIncluded;
          result[2]++;
        } else {
          result = [val, isIncluded, 1];
          resultMap[val] = result;
          data.push(result);
        }
        dataRowAllFilters += isIncluded;
      }
    }

    //TODO primary key should be indicated in columns
    const table = new Table({
      data,
      primaryKey: "name",
      columns: SET_FILTER_DATA_COLUMNS,
    });
    return new SetFilterRowSet(
      table,
      SET_FILTER_DATA_COLUMNS,
      column.name,
      dataRowAllFilters,
      dataRowCount
    );
  }
}

//TODO should range be baked into the concept of RowSet ?
export class RowSet extends BaseRowSet {
  /** deprecated */
  private type: string;
  private currentFilter: any;

  // TODO stream as above
  static fromGroupRowSet({ table, columns, currentFilter: filter }) {
    return new RowSet(table, columns, {
      filter,
    });
  }
  //TODO consolidate API of rowSet, groupRowset
  constructor(
    table: Table,
    columns: TableColumn[],
    offset = 0,
    { filter = null } = NO_OPTIONS
  ) {
    super(table, columns);
    this.type = DataTypes.ROW_DATA;
    this.project = projectColumns(table.columnMap, columns, this.meta);
    this.sortSet = this.buildSortSet();
    this.filterSet = null;
    if (filter) {
      this.currentFilter = filter;
      this.filter(filter);
    }
  }

  buildSortSet() {
    const len = this.data.length;
    const arr: SortSet = [];
    for (let i = 0; i < len; i++) {
      arr[i] = [i, 0, 0];
    }
    return arr as SortSet;
  }

  slice(lo, hi) {
    const {
      data,
      selectedRowsIDX,
      filterSet,
      offset,
      sortCols,
      sortSet,
      sortReverse,
    } = this;
    if (filterSet) {
      const filterMapper =
        typeof filterSet[0] === "number"
          ? (idx) => data[idx]
          : ([idx]) => data[idx];

      const results = [];
      for (let i = lo, len = filterSet.length; i < len && i < hi; i++) {
        const row = sortReverse
          ? filterMapper(filterSet[len - i - 1])
          : filterMapper(filterSet[i]);
        results.push(row);
      }
      return results.map(this.project(lo, offset, selectedRowsIDX));
    } else if (sortCols) {
      const results = [];
      for (let i = lo, len = data.length; i < len && i < hi; i++) {
        const idx = sortReverse ? sortSet[len - i - 1][0] : sortSet[i][0];
        const row = data[idx];
        results.push(row);
      }
      return results.map(this.project(lo, offset, selectedRowsIDX));
    } else {
      return this.data
        .slice(lo, hi)
        .map(this.project(lo, offset, selectedRowsIDX));
    }
  }

  // deprecated ?
  get size() {
    return this.filterSet === null ? this.data.length : this.filterSet.length;
  }

  get first() {
    return this.data[0];
  }
  get last() {
    return this.data[this.data.length - 1];
  }
  get rawData() {
    return this.data;
  }

  setStatus(status) {
    this.status = status;
  }

  addRows(rows) {
    addRowsToIndex(rows, this.index, this.meta.IDX);
    this.data = this.data.concat(rows);
  }

  sort(sortDefs: VuuSortCol[]) {
    const sortSet =
      this.currentFilter == null
        ? this.sortSet
        : (this.filterSet = sortableFilterSet(this.filterSet));

    this.sortRequired = this.currentFilter !== null;

    if (sortReversed(this.sortCols, sortDefs, SINGLE_COLUMN)) {
      this.sortReverse = !this.sortReverse;
    } else if (
      this.sortCols &&
      sortExtendsExistingSort(this.sortCols, sortDefs)
    ) {
      this.sortReverse = false;
      sortExtend(sortSet, this.data, sortDefs, this.columnMap);
    } else {
      this.sortReverse = false;
      sort(sortSet, this.data, sortDefs, this.columnMap);
    }

    this.sortCols = sortDefs;
  }

  clearFilter() {
    this.currentFilter = null;
    this.filterSet = null;
    if (this.sortRequired) {
      this.sort(this.sortCols);
    }
  }

  filter(filter: Filter) {
    const extendsCurrentFilter = extendsFilter(this.currentFilter, filter);
    const fn = filter && filterPredicate(this.columnMap, filter);
    const { data: rows } = this;
    let [navSet] = this.selectNavigationSet(
      extendsCurrentFilter && this.filterSet
    );
    const newFilterSet = [];

    for (let i = 0; i < navSet.length; i++) {
      const rowIdx = navSet === this.filterSet ? navSet[i] : navSet[i][0];
      const row = rows[rowIdx];
      if (fn(row)) {
        newFilterSet.push(rowIdx);
      }
    }

    // recompute selected.rows from selectedRowIDX
    if (this.selectedRowsIDX.length) {
      const { selectedRowsIDX, selected } = this;
      selected.rows.length = 0;
      for (let i = 0; i < newFilterSet.length; i++) {
        const rowIDX = newFilterSet[i];
        if (selectedRowsIDX.includes(rowIDX)) {
          selected.rows.push(i);
        }
      }
    }

    this.filterSet = newFilterSet;
    this.currentFilter = filter;
    if (!extendsCurrentFilter && this.sortRequired) {
      // TODO this might be very expensive for large dataset
      // WHEN DO WE DO THIS - IS THIS CORRECT !!!!!
      this.sort(this.sortCols);
    }
    return newFilterSet.length;
  }

  update(idx, updates) {
    if (this.currentFilter === null && this.sortCols === null) {
      if (idx >= this.range.lo && idx < this.range.hi) {
        return [idx + this.offset, ...updates];
      }
    } else if (this.currentFilter === null) {
      const { sortSet } = this;
      for (let i = this.range.lo; i < this.range.hi; i++) {
        const [rowIdx] = sortSet[i];
        if (rowIdx === idx) {
          return [i + this.offset, ...updates];
        }
      }
    } else {
      // sorted AND/OR filtered
      const { filterSet } = this;
      for (let i = this.range.lo; i < this.range.hi; i++) {
        const rowIdx = Array.isArray(filterSet[i])
          ? filterSet[i][0]
          : filterSet[i];
        if (rowIdx === idx) {
          return [i + this.offset, ...updates];
        }
      }
    }
  }

  insert(idx, row) {
    // TODO multi colun sort sort DSC
    if (this.sortCols === null && this.currentFilter === null) {
      // simplest scenario, row will be at end of sortset ...
      this.sortSet.push([idx, null, null]);
      if (idx >= this.range.hi) {
        // ... row is beyond viewport
        return {
          size: this.size,
        };
      } else {
        // ... row is within viewport
        return {
          size: this.size,
          replace: true,
        };
      }
    } else if (this.currentFilter === null) {
      // sort only - currently only support single column sorting
      const sortCols = mapSortDefsToSortCriteria(this.sortCols, this.columnMap);
      const [[colIdx]] = sortCols;
      const sortRow = [idx, row[colIdx]];
      const sorter = sortBy([[1, "asc"]]); // the sortSet is always ascending
      const sortPos = sortPosition(
        this.sortSet,
        sorter,
        sortRow,
        "last-available"
      );
      this.sortSet.splice(sortPos, 0, sortRow);

      // we need to know whether it is an ASC or DSC sort to determine whether row is in viewport
      const viewportPos = this.sortReverse ? this.size - sortPos : sortPos;

      if (viewportPos >= this.range.hi) {
        return {
          size: this.size,
        };
      } else if (viewportPos >= this.range.lo) {
        return {
          size: this.size,
          replace: true,
        };
      } else {
        return {
          size: this.size,
          offset: this.offset - 1,
        };
      }
    } else if (this.sortCols === null) {
      // filter only
      const fn = filterPredicate(this.columnMap, this.currentFilter);
      if (fn(row)) {
        const navIdx = this.filterSet.length;
        this.filterSet.push(idx);
        if (navIdx >= this.range.hi) {
          // ... row is beyond viewport
          return {
            size: this.size,
          };
        } else if (navIdx >= this.range.lo) {
          // ... row is within viewport
          return {
            size: this.size,
            replace: true,
          };
        } else {
          return {
            size: this.size,
            offset: this.offset - 1,
          };
        }
      } else {
        return {};
      }
    } else {
      // sort AND filter
      const fn = filterPredicate(this.columnMap, this.currentFilter);
      if (fn(row)) {
        // TODO what about totalCOunt

        const sortCols = mapSortDefsToSortCriteria(
          this.sortCols,
          this.columnMap
        );
        const [[colIdx, direction]] = sortCols; // TODO multi-colun sort
        const sortRow = [idx, row[colIdx]];
        const sorter = sortBy([[1, direction]]); // TODO DSC
        const navIdx = sortPosition(
          this.filterSet,
          sorter,
          sortRow,
          "last-available"
        );
        this.filterSet.splice(navIdx, 0, sortRow);

        if (navIdx >= this.range.hi) {
          // ... row is beyond viewport
          return {
            size: this.size,
          };
        } else if (navIdx >= this.range.lo) {
          // ... row is within viewport
          return {
            size: this.size,
            replace: true,
          };
        } else {
          return {
            size: this.size,
            offset: this.offset - 1,
          };
        }
      } else {
        return {};
      }
    }
  }
}

// TODO need to retain and return any searchText
export class SetFilterRowSet extends RowSet {
  constructor(table, columns, columnName, dataRowAllFilters, dataRowTotal) {
    super(table, columns);
    this.type = DataTypes.FILTER_DATA;
    this.columnName = columnName;
    this._searchText = null;
    this.dataRowFilter = null;
    this.dataCounts = {
      dataRowTotal,
      dataRowAllFilters,
      dataRowCurrentFilter: 0,
      filterRowTotal: this.data.length,
      filterRowSelected: this.data.length,
      filterRowHidden: 0,
    };
    this.sort([{ column: "name", sortType: "A" }]);
  }

  createSelectionModel() {
    return new SelectionModel(SelectionModelType.Checkbox);
  }

  clearRange() {
    this.range = { lo: 0, hi: 0 };
  }

  get values() {
    const key = this.columnMap["name"];
    return this.filterSet.map((idx) => this.data[idx][key]);
  }

  // will we ever need this on base rowset ?
  getSelectedValue(idx) {
    const { data, sortSet, filterSet } = this;
    if (filterSet) {
      const filterEntry = filterSet[idx];
      const rowIDX =
        typeof filterEntry === "number" ? filterEntry : filterEntry[0];
      return data[rowIDX][0];
    } else {
      return sortSet[idx][1];
    }
  }

  setSelectedFromFilter(dataRowFilter) {
    const columnFilter = extractFilterForColumn(dataRowFilter, this.columnName);
    const columnMap = this.table.columnMap;
    const { data, filterSet, sortSet } = this;

    this.dataRowFilter = dataRowFilter;

    if (columnFilter) {
      const fn = filterPredicate(
        columnMap,
        overrideColName(columnFilter, "name"),
        true
      );
      const selectedRows = [];
      const selectedRowsIDX = [];

      if (filterSet) {
        for (let i = 0; i < filterSet.length; i++) {
          const rowIDX = filterSet[i];
          if (fn(data[rowIDX])) {
            selectedRows.push(i);
            selectedRowsIDX.push(rowIDX);
          }
        }
      } else {
        for (let i = 0; i < data.length; i++) {
          const rowIDX = sortSet[i][0];
          if (fn(data[rowIDX])) {
            selectedRows.push(i);
            selectedRowsIDX.push(rowIDX);
          }
        }
      }

      this.selected = { rows: selectedRows, focusedIdx: -1, lastTouchIdx: -1 };
      this.selectedRowsIDX = selectedRowsIDX;
    } else {
      this.selectAll();
    }

    return this.currentRange();
  }
}
