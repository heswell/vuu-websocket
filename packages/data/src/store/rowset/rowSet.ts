/**
 * Keep all except for groupRowset in this file to avoid circular reference warnings
 */
import { TableColumn } from "@heswell/server-types";
import { Filter } from "@vuu-ui/vuu-filter-types";
import { filterPredicate } from "@vuu-ui/vuu-filter-parser";
import { VuuDataRow, VuuSortCol } from "@vuu-ui/vuu-protocol-types";
import { ColumnMap } from "@vuu-ui/vuu-utils";
import {
  ColumnMetaData,
  MultiRowProjectorFactory,
  metaData,
  projectColumn,
  projectColumns,
} from "../columnUtils.ts";
import {
  SET_FILTER_DATA_COLUMNS,
  extendsExistingFilter,
  extractFilterForColumn,
  overrideColName,
  splitFilterOnColumn,
} from "../filter.ts";
import {
  NULL_RANGE,
  Range,
  getDeltaRange,
  getFullRange,
} from "../rangeUtils.ts";
import { addRowsToIndex, arrayOfIndices } from "../rowUtils.ts";
import {
  SortSet as IndexSet,
  mapSortDefsToSortCriteria,
  sort,
  sortBy,
  sortExtend,
  sortExtendsExistingSort,
  sortPosition,
  sortReversed,
} from "../sortUtils.ts";
import { Row } from "../storeTypes.ts";
import { Table } from "../table.ts";
import { DataResponse, IRowSet } from "./IRowSet.ts";
import { identifySelectionChanges } from "../selectionUtils.ts";
import { DataSourceRow } from "@vuu-ui/vuu-data-types";

const SINGLE_COLUMN = 1;

const NO_OPTIONS = {
  filter: null,
};

const NULL_SORTSET: IndexSet = [[-1, -1, -1]];

export abstract class BaseRowSet implements IRowSet {
  public range: Range = NULL_RANGE;

  protected columnMap: ColumnMap;
  protected currentFilter: Filter | undefined;
  protected filterSet: number[] | undefined;
  protected meta: ColumnMetaData;
  /** key values of selected rows   */
  protected selected: string[] = [];
  protected sortSet: IndexSet = NULL_SORTSET;
  protected sortCols: VuuSortCol[] | undefined;
  protected data: Row[];
  protected sortKeyMap: Map<string, number> = new Map();
  protected filterKeyMap: Map<string, number> = new Map();

  private columns: TableColumn[];
  private table: Table;

  project: MultiRowProjectorFactory = () => () => {
    throw Error("project method must be implemented");
  };

  constructor(table: Table, columns: TableColumn[]) {
    this.table = table;
    this.columns = columns;
    this.columnMap = table.columnMap;
    this.meta = metaData(columns);
    this.data = table.rows;
  }

  abstract createProjectRowFactoryMethod(
    columnMap: ColumnMap,
    solumns: TableColumn[],
    meta: ColumnMetaData
  ): MultiRowProjectorFactory;

  // used by binned rowset
  get filteredData() {
    if (this.filterSet) {
      return this.filterSet;
    } else {
      const { IDX } = this.meta;
      return this.data.map((row: Row) => row[IDX]);
    }
  }

  protected get keyMap() {
    return this.filterSet ? this.filterKeyMap : this.sortKeyMap;
  }

  get totalRowCount() {
    return this.data.length;
  }

  get selectedRowCount() {
    return this.selected.length;
  }

  get size(): number {
    throw Error("not implemented");
  }

  abstract filter(filter: Filter): number;

  abstract sort(sortDefs: VuuSortCol[]): void;

  abstract slice(from: number, to: number): VuuDataRow[];

  clear() {
    console.log("clear rowset");
  }

  setRange(range = this.range, useDelta = true): DataResponse {
    const { from, to } = useDelta
      ? getDeltaRange(this.range, range)
      : getFullRange(range);
    const resultset = this.slice(from, to);
    this.range = range;
    return {
      rows: resultset,
      size: this.size,
    };
  }

  currentRange(): DataResponse {
    const { from, to } = this.range;
    const resultset = this.slice(from, to);
    return {
      rows: resultset,
      size: this.size,
    };
  }

  protected get indexOfKeyField() {
    return this.table.columnMap[this.table.schema.key];
  }

  // selected are the index positions of rows as presented to the user. That
  // means they refer to positions within the current indexSet. We will store
  // them as positions within the underlying table, which never change.
  // Note: deletions from the underlying table will have to be dealt with.

  private selectedIndicesToKeyValues = (selectedIndices: number[]) => {
    const {
      filterSet,
      sortSet,
      table: { columnMap, schema },
    } = this;
    const indexOfKeyField = columnMap[schema.key];
    if (filterSet) {
      return selectedIndices.map((idx) => {
        const sortSetIndex = filterSet[idx];
        const [rowIndex] = sortSet[sortSetIndex];
        return this.data[rowIndex][indexOfKeyField] as string;
      });
    } else {
      return selectedIndices.map(
        (idx) => this.data[sortSet[idx][0]][indexOfKeyField] as string
      );
    }
  };

  select(selected: number[]): DataResponse {
    const { data, filterKeyMap, filterSet, range, size, sortKeyMap, sortSet } =
      this;

    const selectedKeyValues = this.selectedIndicesToKeyValues(selected);

    const { from, to } = range;
    const [newSelected, deselected] = identifySelectionChanges(
      this.selected,
      selectedKeyValues
    );
    this.selected = selectedKeyValues;
    const keyMap = filterSet ? filterKeyMap : sortKeyMap;
    const getRowIndex = filterSet
      ? (idx: number) => sortSet[filterSet[idx]][0]
      : (idx: number) => sortSet[idx][0];

    const keyFieldIndex = this.columnMap[this.table.schema.key];

    const updatedRows: VuuDataRow[] = [];
    const projectRow = projectColumn(
      this.columnMap,
      this.columns,
      this.meta,
      keyFieldIndex,
      selectedKeyValues
    );

    for (const key of newSelected) {
      const idx = keyMap.get(key) as number;
      const rowIndex = getRowIndex(idx);
      if (idx >= from && idx < to) {
        updatedRows.push(projectRow(data[rowIndex], idx));
      }
    }

    for (const key of deselected) {
      const idx = keyMap.get(key) as number;
      const rowIndex = getRowIndex(idx);
      if (idx >= from && idx < to) {
        updatedRows.push(projectRow(data[rowIndex], idx));
      }
    }

    return {
      rows: updatedRows,
      size,
    };
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
  // TODO stream as above
  // static fromGroupRowSet({ table, columns, currentFilter: filter }) {
  //   return new RowSet(table, columns, {
  //     filter,
  //   });
  // }
  //TODO consolidate API of rowSet, groupRowset
  constructor(
    table: Table,
    columns: TableColumn[],
    { filter = null } = NO_OPTIONS
  ) {
    super(table, columns);
    const keyFieldIndex = this.columnMap[table.schema.key];
    this.project = projectColumns(
      table.columnMap,
      columns,
      this.meta,
      keyFieldIndex
    );
    this.sortSet = this.buildSortSet();
    this.setMapKeys(this.sortKeyMap, this.sortSet);
    if (filter) {
      this.currentFilter = filter;
      this.filter(filter);
    }
  }

  /**
   *
   * Initialise an empty sortset,
   * allowing for two sort columns.
   * We are only currently supporting one or two columns sorting.
   * TODO mechanism for > 2 column sort
   * populate map of row key values to sortSet index positions
   */
  buildSortSet() {
    const { data } = this;
    const sortSet: IndexSet = Array(data.length);
    for (let i = 0; i < data.length; i++) {
      // this is the initial, unsorted state, where rowIndex value
      // (first item of sortSet tuple) equals rowIndex value from data)
      // and is same as natural array position. The latter will no longer
      // be true once data is sorted.
      sortSet[i] = [i, 0, 0];
    }
    return sortSet;
  }

  setMapKeys(
    keyMap: Map<string, number>,
    sortSet: IndexSet,
    filterSet?: number[]
  ) {
    const { data, indexOfKeyField } = this;

    if (filterSet) {
      for (let i = 0; i < filterSet.length; i++) {
        const sortSetIndexIndex = filterSet[i];
        const [rowIndex] = sortSet[sortSetIndexIndex];
        const keyValue = data[rowIndex][indexOfKeyField];
        keyMap.set(keyValue.toString(), i);
      }
    } else {
      for (let i = 0; i < sortSet.length; i++) {
        const [rowIndex] = sortSet[i];
        const keyValue = data[rowIndex][indexOfKeyField];
        keyMap.set(keyValue.toString(), i);
      }
    }
  }

  slice(lo: number, hi: number) {
    const { data, filterSet, selected, sortCols, sortSet } = this;

    const indexSet = filterSet ?? sortSet;
    const getRowIndex = filterSet
      ? (idx: number) => sortSet[filterSet[idx]][0]
      : (idx: number) => sortSet[idx][0];

    const results = [];
    for (let i = lo, len = indexSet.length; i < len && i < hi; i++) {
      const rowIndex = getRowIndex(i);
      results.push(data[rowIndex]);
    }
    return results.map(this.project(lo, selected));
  }

  // deprecated ?
  get size() {
    return this.data.length;
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
    const start = performance.now();
    const { data, filterSet, sortSet } = this;

    if (sortReversed(this.sortCols, sortDefs, SINGLE_COLUMN)) {
      sortSet.reverse();
      this.setMapKeys(this.sortKeyMap, sortSet);
    } else if (
      this.sortCols &&
      sortExtendsExistingSort(this.sortCols, sortDefs)
    ) {
      sortExtend(sortSet, this.data, sortDefs, this.columnMap);
    } else {
      sort(sortSet, this.data, sortDefs, this.columnMap);
    }

    this.sortCols = sortDefs;
    this.setMapKeys(this.sortKeyMap, sortSet);

    if (filterSet && this.currentFilter) {
      const fn = filterPredicate(this.columnMap, this.currentFilter);

      const indexSet = sortSet;
      const getRowIndex = (idx: number) => sortSet[idx][0];
      const newFilterSet: number[] = [];

      for (let i = 0; i < indexSet.length; i++) {
        const rowIdx = getRowIndex(i);
        const row = data[rowIdx];
        if (fn(row as DataSourceRow)) {
          newFilterSet.push(i);
        }
      }

      this.setMapKeys(this.filterKeyMap, this.sortSet, newFilterSet);

      this.filterSet = newFilterSet;
    }
    const end = performance.now();
    console.log(`sort took ${end - start} ms`);
  }

  clearFilter() {
    this.currentFilter = undefined;
    this.filterSet = undefined;
  }

  filter(filter: Filter) {
    const start = performance.now();
    const extendsCurrentFilter = extendsExistingFilter(
      filter,
      this.currentFilter
    );
    const fn = filterPredicate(this.columnMap, filter);
    const { data, filterSet, sortSet } = this;

    const indexSet = filterSet ?? sortSet;
    const getRowIndex = filterSet
      ? (idx: number) => sortSet[filterSet[idx]][0]
      : (idx: number) => sortSet[idx][0];

    const newFilterSet: number[] = [];

    for (let i = 0; i < indexSet.length; i++) {
      const rowIdx = getRowIndex(i);
      const row = data[rowIdx];
      if (fn(row as DataSourceRow)) {
        newFilterSet.push(i);
      }
    }

    this.setMapKeys(this.filterKeyMap, this.sortSet, newFilterSet);

    this.filterSet = newFilterSet;
    this.currentFilter = filter;

    const end = performance.now();
    console.log(`filter took ${end - start} ms`);
  }

  update(idx, updates) {
    if (this.currentFilter === null && this.sortCols === null) {
      if (idx >= this.range.lo && idx < this.range.hi) {
        return [idx, ...updates];
      }
    } else if (this.currentFilter === null) {
      const { sortSet } = this;
      for (let i = this.range.lo; i < this.range.hi; i++) {
        const [rowIdx] = sortSet[i];
        if (rowIdx === idx) {
          return [i, ...updates];
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
          return [i, ...updates];
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

  clearRange() {
    this.range = { from: 0, to: 0 };
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
      this.indexSetSelected = selectedRowsIDX;
    } else {
      this.selectAll();
    }

    return this.currentRange();
  }
}
