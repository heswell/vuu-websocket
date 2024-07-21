import { TableColumn } from "@heswell/server-types";
import { parseFilter } from "@vuu-ui/vuu-filter-parser";
import type { Filter } from "@vuu-ui/vuu-filter-types";
import {
  ClientToServerChangeViewPort,
  VuuFilter,
  VuuGroupBy,
  VuuSort,
  VuuSortCol,
} from "@vuu-ui/vuu-protocol-types";
import type { ColumnMap } from "@vuu-ui/vuu-utils";
import { buildColumnMap, toColumn } from "./columnUtils.ts";
import { Range, resetRange } from "./rangeUtils.ts";
import { DataResponse, GroupRowSet, RowSet } from "./rowset";
import { sortHasChanged } from "./sortUtils.ts";
import { RowInsertHandler, RowUpdateHandler, Table } from "./table.ts";
import UpdateQueue from "./update-queue.ts";

export interface DataViewProps {
  columns: (string | TableColumn)[];
  sort: VuuSort;
  groupBy: VuuGroupBy;
  filterSpec: VuuFilter;
}

export default class DataView {
  #columnMap: ColumnMap;
  private _columns: TableColumn[];
  private _vuuFilter: VuuFilter;
  private _filter: Filter | undefined;
  private _groupBy: VuuGroupBy;
  private _table: Table | undefined;
  private rowSet: RowSet | GroupRowSet;
  private _sortDefs: VuuSortCol[];
  private _updateQueue: UpdateQueue | undefined;

  private filterRowSet: any;

  constructor(
    table: Table,
    props: DataViewProps,
    updateQueue = new UpdateQueue()
  ) {
    const { columns, sort, groupBy, filterSpec = { filter: "" } } = props;
    this._table = table;
    this._vuuFilter = filterSpec;
    this._groupBy = groupBy;
    this._sortDefs = sort.sortDefs;
    this._updateQueue = updateQueue;

    this._columns = columns.map(toColumn);
    this.#columnMap = buildColumnMap(this._columns);
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

    table.on("rowUpdated", this.rowUpdated);
    table.on("rowInserted", this.rowInserted);
  }

  // Set the columns from client
  set columns(columns: string[]) {
    this._columns = columns.map(toColumn);
    this.#columnMap = buildColumnMap(this._columns);
  }

  destroy() {
    this._table?.removeListener("rowUpdated", this.rowUpdated);
    this._table?.removeListener("rowInserted", this.rowInserted);
    this.rowSet.clear();
    this._table = undefined;
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
        lo: range.from,
        hi: range.to,
      },
    };
    return results;
  }

  private rowInserted: RowInsertHandler = (idx, row) => {
    // const { _updateQueue, rowSet } = this;
    // const { size = null, replace, updates } = rowSet.insert(idx, row);
    // if (size !== null) {
    //   _updateQueue?.resize(size);
    // }
    // if (replace) {
    //   const { rows, size } = rowSet.currentRange();
    //   _updateQueue?.replace({ rows, size });
    // } else if (updates) {
    //   updates.forEach((update) => {
    //     _updateQueue?.update(update);
    //   });
    // }
  };

  private rowUpdated: RowUpdateHandler = (idx, updates) => {
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
  };

  getData() {
    return this.rowSet;
  }

  private identifyViewportChanges(params: ClientToServerChangeViewPort) {
    const { filterSpec, sort } = params;
    const sortChanged = sortHasChanged(this._sortDefs, sort.sortDefs);
    const filterChanged = this._vuuFilter.filter !== filterSpec.filter;

    return {
      filterChanged,
      sortChanged,
    };
  }

  changeViewport(options: ClientToServerChangeViewPort): DataResponse {
    const { sortChanged, filterChanged } =
      this.identifyViewportChanges(options);

    if (sortChanged) {
      return this.sort(options.sort.sortDefs);
    } else if (filterChanged) {
      return this.filter(options.filterSpec);
    } else {
      return { rows: [], size: -1 };
    }
  }

  //TODO we seem to get a setRange when we reverse sort order, is that correct ?
  setRange(range: Range, useDelta = true): DataResponse {
    console.log(`DATAVIEW.setRange ${JSON.stringify(range)}`);
    return this.rowSet.setRange(range, useDelta);
  }

  select(selection: number[]): DataResponse {
    return this.rowSet.select(selection);
  }

  sort(sortDefs: VuuSortCol[]): DataResponse {
    this._sortDefs = sortDefs;
    this.rowSet.sort(sortDefs);
    // assuming the only time we would not useDelta is when we want to reset ?
    return this.setRange(resetRange(this.rowSet.range), false);
  }

  // filter may be called directly from client, in which case changes should be propagated, where
  // appropriate, to any active filterSet(s). However, if the filterset has been changed, e.g. selection
  // within a set, then filter applied here in consequence must not attempt to reset the same filterSet
  // that originates the change.
  filter(vuuFilter: VuuFilter): DataResponse {
    if (vuuFilter.filter === "") {
      if (this._filter) {
        this.rowSet.clearFilter();
        this._filter = undefined;
        this._vuuFilter = { filter: "" };
        this.filterRowSet = undefined;
        return this.rowSet.setRange(resetRange(this.rowSet.range), false);
      }
    } else {
      const filter = parseFilter(vuuFilter.filter);
      this._vuuFilter = vuuFilter;
      this._filter = filter;
      //   let filterResultset;

      //   if (filter === null && _filter) {
      //     rowSet?.clearFilter();
      //   } else if (filter) {
      this.rowSet.filter(filter);
      //   } else {
      //     throw Error(`InMemoryView.filter setting null filter when we had no filter anyway`);
      //   }

      //   if (filterRowSet && !ignoreFilterRowset) {
      //     if (filter) {
      //       if (filterRowSet.type === DataTypes.FILTER_DATA) {
      //         filterResultset = filterRowSet.setSelectedFromFilter(filter);
      //       }
      //     }

      return this.rowSet.setRange(resetRange(this.rowSet.range), false);
    }

    return { rows: [], size: -1 };
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

  // applyFilterSetChangeToFilter(partialFilter) {
  //   const [result] = this.filter(partialFilter, DataTypes.ROW_DATA, true, true);
  //   this._updateQueue.replace(result);
  // }

  applyFilter() {}

  groupBy(groupby: VuuGroupBy) {
    // const {
    //   rowSet,
    //   _columns,
    //   _groupState,
    //   _sortDefs: _sortCriteria,
    //   _groupBy,
    // } = this;
    // const { range: _range } = rowSet;
    // this._groupBy = groupby;
    // if (groupby === null) {
    //   this.rowSet = RowSet.fromGroupRowSet(this.rowSet);
    // } else {
    //   if (_groupBy.length === 0) {
    //     this.rowSet = new GroupRowSet(
    //       rowSet,
    //       _columns,
    //       groupby,
    //       _groupState,
    //       _sortCriteria
    //     );
    //   } else {
    //     (rowSet as GroupRowSet).groupBy(groupby);
    //   }
    // }
    // return this.rowSet.setRange(_range, false);
  }

  setGroupState() {
    // this._groupState = groupState;
    // const { rowSet } = this;
    // rowSet.setGroupState(groupState);
    // // TODO should we have setRange return the following directly, so IMV doesn't have to decide how to call setRange ?
    // // should we reset the range ?
    // return rowSet.setRange(rowSet.range, false);
  }
}
