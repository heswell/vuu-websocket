import { TableColumn } from "@heswell/server-types";
import {
  ClientToServerChangeViewPort,
  VuuFilter,
  VuuGroupBy,
  VuuSort,
  VuuSortCol,
} from "@vuu-ui/data-types";
import {
  ColumnMap,
  buildColumnMap,
  getFilterType,
  toColumn,
} from "./columnUtils.js";
import { IN, NOT_IN, filterHasChanged, parseFilterQuery } from "./filter.js";
import { Range, resetRange } from "./rangeUtils.js";
import { GroupRowSet, RowSet } from "./rowset/index.js";
import { sortHasChanged } from "./sortUtils.js";
import { Table } from "./table.js";
import { DataTypes } from "./types.js";
import UpdateQueue from "./update-queue.js";

export interface DataViewProps {
  columns: (string | TableColumn)[];
  sort: VuuSort;
  groupBy: VuuGroupBy;
  filterSpec: VuuFilter;
}

const WITH_STATS = true;
export default class DataView {
  private _columnMap: ColumnMap;
  private _columns: TableColumn[];
  private _filterQuery: string | undefined;
  private _filter: Filter | undefined;
  private _groupBy: VuuGroupBy;
  private _table: Table | undefined;
  private rowSet: RowSet | GroupRowSet | undefined;
  private _sortDefs: VuuSortCol[];
  private _updateQueue: UpdateQueue | undefined;

  private filterRowSet: any;

  constructor(
    table: Table,
    props: DataViewProps,
    updateQueue = new UpdateQueue()
  ) {
    const { columns, sort, groupBy, filterSpec } = props;
    this._table = table;
    this._filterQuery = filterSpec.filter;
    this._groupBy = groupBy;
    this._sortDefs = sort.sortDefs;
    this._updateQueue = updateQueue;

    this._columns = columns.map(toColumn);
    this._columnMap = buildColumnMap(this._columns);
    // column defs come from client, this is where we assign column keys

    // TODO we should pass columns into the rowset as it will be needed for computed columns
    this.rowSet = new RowSet(table, this._columns);
    // Is one filterRowset enough, or should we manage one for each column ?
    this.filterRowSet = null;

    // What if data is BOTH grouped and sorted ...
    if (groupBy.length > 0) {
      // more efficient to compute this directly from the table projection
      this.rowSet = new GroupRowSet(this.rowSet, this._columns, this._groupBy);
    } else if (this._sortDefs.length > 0) {
      this.rowSet.sort(this._sortDefs);
    }

    this.rowUpdated = this.rowUpdated.bind(this);
    this.rowInserted = this.rowInserted.bind(this);

    table.on("rowUpdated", this.rowUpdated);
    table.on("rowInserted", this.rowInserted);
  }

  // Set the columns from client
  set columns(columns: string[]) {
    this._columns = columns.map(toColumn);
    this._columnMap = buildColumnMap(this._columns);
  }

  destroy() {
    this._table?.removeListener("rowUpdated", this.rowUpdated);
    this._table?.removeListener("rowInserted", this.rowInserted);
    this._table = undefined;
    this.rowSet = undefined;
    this.filterRowSet = null;
    this._updateQueue = undefined;
  }

  get status() {
    return this._table?.status;
  }

  get updates() {
    const {
      _updateQueue,
      rowSet: { range },
    } = this;
    let results = {
      updates: _updateQueue?.popAll(),
      range: {
        lo: range.lo,
        hi: range.hi,
      },
    };
    return results;
  }

  rowInserted(event, idx, row) {
    const { _updateQueue, rowSet } = this;
    const { size = null, replace, updates } = rowSet.insert(idx, row);
    if (size !== null) {
      _updateQueue?.resize(size);
    }
    if (replace) {
      const { rows, size, offset } = rowSet.currentRange();
      _updateQueue?.replace({ rows, size, offset });
    } else if (updates) {
      updates.forEach((update) => {
        _updateQueue?.update(update);
      });
    }
    // what about offset change only ?
  }

  rowUpdated(event, idx, updates) {
    const { rowSet, _updateQueue } = this;
    const result = rowSet.update(idx, updates);

    if (result) {
      if (rowSet instanceof RowSet) {
        _updateQueue?.update(result);
      } else {
        result.forEach((rowUpdate) => {
          _updateQueue?.update(rowUpdate);
        });
      }
    }
  }

  getData() {
    return this.rowSet;
  }

  private identifyViewportChanges(params: ClientToServerChangeViewPort) {
    const { aggregations, filterSpec, groupBy, sort } = params;
    const sortChanged = sortHasChanged(this._sortDefs, sort.sortDefs);
    const filterChanged = filterHasChanged(this._filterSpec, filterSpec);
    console.log(`sort changes ? ${sortChanged}`);

    return {
      filterChanged,
      sortChanged,
    };
  }

  changeViewport(options: ClientToServerChangeViewPort) {
    console.log(`change viewport`, {
      options: JSON.stringify(options, null, 2),
    });
    const { sort } = options;

    const { sortChanged, filterChanged } =
      this.identifyViewportChanges(options);

    if (sortChanged) {
      return this.sort(options.sort.sortDefs);
    } else if (filterChanged) {
      return this.filter(options.filterSpec.filter);
    } else {
      return { rows: [], size: -1 };
    }
  }

  //TODO we seem to get a setRange when we reverse sort order, is that correct ?
  setRange(range: Range, useDelta = true) {
    console.log(`DATAVIEW.setRange ${JSON.stringify(range)}`);
    return this.rowSet.setRange(range, useDelta);
  }

  select(
    idx,
    rangeSelect,
    keepExistingSelection,
    dataType = DataTypes.ROW_DATA
  ) {
    const rowset = this.getData(dataType);
    const updates = rowset.select(idx, rangeSelect, keepExistingSelection);
    if (dataType === DataTypes.ROW_DATA) {
      return this.selectResponse(updates, dataType, rowset);
    } else {
      console.log(
        `[dataView] select on filterSet (range ${JSON.stringify(rowset.range)})`
      );
      // we need to handle this case here, as the filter we construct depends on the selection details
      // TODO we shouldn't be using the sortSet here, need an API method
      const value = rowset.getSelectedValue(idx);
      const isSelected = rowset.selected.rows.includes(idx);
      const filter = {
        type: isSelected ? IN : NOT_IN,
        colName: rowset.columnName,
        values: [value],
      };
      this.applyFilterSetChangeToFilter(filter);

      if (updates.length > 0) {
        return {
          dataType,
          updates,
          stats: rowset.stats,
        };
      }
    }
  }

  selectAll(dataType = DataTypes.ROW_DATA) {
    const rowset = this.getData(dataType);
    return this.selectResponse(rowset.selectAll(), dataType, rowset, true);
  }

  selectNone(dataType = DataTypes.ROW_DATA) {
    const rowset = this.getData(dataType);
    return this.selectResponse(rowset.selectNone(), dataType, rowset, false);
  }

  // Handle response to a selecAll / selectNode operation. This may be operating on
  // the entire resultset, or a filtered subset
  selectResponse(updates, dataType, rowset, allSelected) {
    const updatesInViewport = updates.length > 0;
    const { stats } = rowset;
    if (dataType === DataTypes.ROW_DATA) {
      if (updatesInViewport) {
        return { updates };
      }
    } else {
      const { totalRowCount, totalSelected } = stats;

      // Maybe defer the filter operation ?
      if (totalSelected === 0) {
        this.applyFilterSetChangeToFilter({
          colName: rowset.columnName,
          type: IN,
          values: [],
        });
      } else if (totalSelected === totalRowCount) {
        this.applyFilterSetChangeToFilter({
          colName: rowset.columnName,
          type: NOT_IN,
          values: [],
        });
      } else {
        // we are not operating on the whole dataset, therefore it is a filtered subset
        if (allSelected) {
          this.applyFilterSetChangeToFilter({
            colName: rowset.columnName,
            type: IN,
            values: rowset.values,
          });
        } else {
          this.applyFilterSetChangeToFilter({
            colName: rowset.columnName,
            type: NOT_IN,
            values: rowset.values,
          });
        }
      }

      // always return, as the stats might be needed
      // if (updatesInViewport){
      return {
        dataType,
        updates,
        stats: rowset.stats,
      };
      // }
    }
  }

  sort(sortDefs: VuuSortCol[]) {
    this._sortDefs = sortDefs;
    this.rowSet?.sort(sortDefs);
    // assuming the only time we would not useDelta is when we want to reset ?
    return this.setRange(resetRange(this.rowSet.range), false);
  }

  // filter may be called directly from client, in which case changes should be propagated, where
  // appropriate, to any active filterSet(s). However, if the filterset has been changed, e.g. selection
  // within a set, then filter applied here in consequence must not attempt to reset the same filterSet
  // that originates the change.
  filter(filterQuery: string) {
    console.log(`filter ${filterQuery}`);
    const filter = parseFilterQuery(filterQuery);

    //   if (incremental) {
    //     filter = addFilter(this._filterSpec, filter);
    //   }
    const { rowSet } = this;
    const { range } = rowSet as RowSet;
    this._filterQuery = filterQuery;
    this._filter = filter;
    //   let filterResultset;

    //   if (filter === null && _filter) {
    //     rowSet?.clearFilter();
    //   } else if (filter) {
    this.rowSet?.filter(filter);
    //   } else {
    //     throw Error(`InMemoryView.filter setting null filter when we had no filter anyway`);
    //   }

    //   if (filterRowSet && !ignoreFilterRowset) {
    //     if (filter) {
    //       if (filterRowSet.type === DataTypes.FILTER_DATA) {
    //         filterResultset = filterRowSet.setSelectedFromFilter(filter);
    //       }
    //     }

    const resultSet = {
      ...this.rowSet?.setRange(resetRange(range), false),
      filter,
    };

    return [resultSet];
  }

  // //TODO merge with method above
  // filterFilterData(filter) {
  //   const { filterRowSet } = this;
  //   if (filterRowSet) {
  //     if (filter === null) {
  //       filterRowSet.clearFilter();
  //     } else if (filter) {
  //       filterRowSet.filter(filter);
  //     }

  //     return filterRowSet.setRange(resetRange(filterRowSet.range), false, WITH_STATS);
  //   } else {
  //     console.error(`[InMemoryView] filterfilterRowSet no filterRowSet`);
  //   }
  // }

  applyFilterSetChangeToFilter(partialFilter) {
    const [result] = this.filter(partialFilter, DataTypes.ROW_DATA, true, true);
    this._updateQueue.replace(result);
  }

  applyFilter() {}

  groupBy(groupby: VuuGroupBy) {
    const {
      rowSet,
      _columns,
      _groupState,
      _sortDefs: _sortCriteria,
      _groupBy,
    } = this;
    const { range: _range } = rowSet;
    this._groupBy = groupby;

    if (groupby === null) {
      this.rowSet = RowSet.fromGroupRowSet(this.rowSet);
    } else {
      if (_groupBy.length === 0) {
        this.rowSet = new GroupRowSet(
          rowSet,
          _columns,
          groupby,
          _groupState,
          _sortCriteria
        );
      } else {
        (rowSet as GroupRowSet).groupBy(groupby);
      }
    }
    return this.rowSet.setRange(_range, false);
  }

  setGroupState(groupState) {
    this._groupState = groupState;
    const { rowSet } = this;
    rowSet.setGroupState(groupState);
    // TODO should we have setRange return the following directly, so IMV doesn't have to decide how to call setRange ?
    // should we reset the range ?
    return rowSet.setRange(rowSet.range, false);
  }

  getFilterData(column, range) {
    console.log(
      `dataView.getFilterData for column ${column.name} range ${JSON.stringify(
        range
      )}`
    );
    const { rowSet, filterRowSet, _filterSpec: filter, _columnMap } = this;
    // If our own dataset has been filtered by the column we want values for, we cannot use it, we have
    // to go back to the source, using a filter which excludes the one in place on the target column.
    const columnName = column.name;
    const colDef = this._columns.find((col) => col.name === columnName);
    // No this should be decided beforehand (on client)
    const type = getFilterType(colDef);

    if (!filterRowSet || filterRowSet.columnName !== column.name) {
      console.log(`create the filterRowset`);
      this.filterRowSet = rowSet.getDistinctValuesForColumn(column);
    } else if (filterRowSet && filterRowSet.columnName === column.name) {
      // if we already have the data for this filter, nothing further to do except reset the filterdata range
      // so next request will return full dataset.
      filterRowSet.setRange({ lo: 0, hi: 0 });
    }
    // If we already have a filterRowset for this column, but a filter on another column has changed, we need to
    // recreate the filterRowset: SHould this happen when filter happens ?

    if (filter) {
      this.filterRowSet.setSelectedFromFilter(filter);
    } else {
      this.filterRowSet.selectAll();
    }

    // do we need to returtn searchText ? If so, it should
    // be returned by the rowSet

    // TODO wrap this, we use it  alot
    console.log(`[dataView] return filterSet range ${JSON.stringify(range)}`);
    return this.filterRowSet.setRange(range, false, WITH_STATS);
  }
}
