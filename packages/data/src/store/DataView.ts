import { TableColumn } from "@heswell/server-types";
import { parseFilter } from "@vuu-ui/vuu-filter-parser";
import {
  VuuAggregation,
  VuuFilter,
  VuuGroupBy,
  VuuRange,
  VuuSort,
  VuuSortCol,
  VuuViewportChangeRequest,
} from "@vuu-ui/vuu-protocol-types";
import {
  isConfigChanged,
  vanillaConfig,
  type ColumnMap,
} from "@vuu-ui/vuu-utils";
import { buildColumnMap, toColumn } from "./columnUtils.ts";
import { Range, resetRange } from "./rangeUtils.ts";
import { DataResponse, GroupRowSet, RowSet } from "./rowset/index.ts";
import { RowInsertHandler, RowUpdateHandler, Table } from "./table.ts";
import UpdateQueue from "./update-queue.ts";
import { DataSourceConfig, WithFullConfig } from "@vuu-ui/vuu-data-types";
import { groupByExtendsExistingGroupBy } from "./rowset/group-utils.ts";

const EmptyFilter: Readonly<VuuFilter> = { filter: "" };

export type DataViewConfig = DataSourceConfig & {
  range: VuuRange;
};

export default class DataView {
  #config: WithFullConfig = vanillaConfig;
  #columnMap: ColumnMap;
  #columns: TableColumn[];
  #id: string;
  #table: Table | undefined;
  #updateQueue: UpdateQueue;

  private _vuuFilter: VuuFilter = EmptyFilter;
  private rowSet: RowSet | GroupRowSet;

  constructor(
    id: string,
    table: Table,
    { range, ...config }: DataViewConfig,
    updateQueue = new UpdateQueue()
  ) {
    this.#id = id;
    this.#config = {
      ...this.#config,
      aggregations: config.aggregations || this.#config.aggregations,
      columns: config.columns || this.#config.columns,
      filterSpec: config.filterSpec || this.#config.filterSpec,
      groupBy: config.groupBy || this.#config.groupBy,
      sort: config.sort || this.#config.sort,
      // visualLink: config.visualLink || this.#config.visualLink,
    };

    this.#table = table;
    this.#updateQueue = updateQueue;
    this.#columnMap = buildColumnMap(this.#config.columns);
    this.#columns = this.#config.columns.map(toColumn);

    const rowSet = new RowSet(id, table, this.columns, { range });
    // TODO we should pass columns into the rowset as it will be needed for computed columns
    this.rowSet =
      this.groupBy.length === 0
        ? rowSet
        : new GroupRowSet(rowSet, this.groupBy);

    if (this.sortDefs.length > 0) {
      this.rowSet.sort(this.sortDefs);
    }

    if (this.#config.filterSpec.filter) {
      this.filter(this.#config.filterSpec);
    }

    table.on("rowUpdated", this.rowUpdated);
    table.on("rowInserted", this.rowInserted);
  }

  destroy() {
    console.log(`destroy view`);
    this.#table?.removeListener("rowUpdated", this.rowUpdated);
    this.#table?.removeListener("rowInserted", this.rowInserted);
    this.rowSet.clear();
    this.#table = undefined;
  }

  get columns() {
    return this.#columns;
  }
  get hasFilter() {
    return this.#config.filterSpec.filter !== "";
  }

  get hasGroupBy() {
    return this.groupBy.length > 0;
  }

  get groupBy(): VuuGroupBy {
    return this.#config.groupBy;
  }
  get sortDefs(): VuuSortCol[] {
    return this.#config.sort.sortDefs;
  }

  get updates() {
    const {
      rowSet: { range },
    } = this;
    let results = {
      updates: this.#updateQueue.popAll(),
      range: {
        from: range.from,
        to: range.to,
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
    const { rowSet } = this;
    const result = rowSet.update(idx, updates);

    if (result) {
      if (rowSet instanceof RowSet) {
        this.#updateQueue.update(result);
      } /* else {
        result.forEach((rowUpdate) => {
          _updateQueue?.update(rowUpdate);
        });
      }*/
    }
  };

  getData() {
    return this.rowSet;
  }

  // this should be invoked by setting the options
  changeViewport(options: VuuViewportChangeRequest): DataResponse | undefined {
    // console.log({ options, config: this.#config });
    const { noChanges, ...changes } = isConfigChanged(this.#config, options);

    console.log({ noChanges, otherChanges: changes });

    if (changes.sortChanged) {
      return this.sort(options.sort);
    } else if (changes.filterChanged) {
      return this.filter(options.filterSpec);
    } else if (changes.groupByChanged) {
      return this.group(options.groupBy);
    } else if (changes.aggregationsChanged) {
      return this.aggregate(options.aggregations);
    } else {
      return { rows: [], size: -1 };
    }
  }

  getDataForCurrentRange() {
    return this.rowSet.currentRange();
  }

  //TODO we seem to get a setRange when we reverse sort order, is that correct ?
  setRange(range: Range, useDelta = true): DataResponse {
    console.log(`DATAVIEW.setRange ${JSON.stringify(range)}`);
    return this.rowSet.setRange(range, useDelta);
  }

  select(selection: number[]): DataResponse {
    return this.rowSet.select(selection);
  }

  aggregate(aggregations: VuuAggregation[]): DataResponse {
    this.#config = {
      ...this.#config,
      aggregations,
    };

    if (this.rowSet instanceof GroupRowSet) {
      this.rowSet.aggregations = aggregations;
      return this.setRange(resetRange(this.rowSet.range), false);
    } else {
      throw Error(
        "DataView aggregate cannot perform aggregation on a non grouped dataset"
      );
    }
  }

  sort(sort: VuuSort): DataResponse {
    this.#config = {
      ...this.#config,
      sort,
    };
    this.rowSet.sort(this.sortDefs);
    // assuming the only time we would not useDelta is when we want to reset ?
    return this.setRange(resetRange(this.rowSet.range), false);
  }

  // filter may be called directly from client, in which case changes should be propagated, where
  // appropriate, to any active filterSet(s). However, if the filterset has been changed, e.g. selection
  // within a set, then filter applied here in consequence must not attempt to reset the same filterSet
  // that originates the change.
  filter(filterSpec: VuuFilter): DataResponse {
    const { hasFilter } = this;
    this.#config = {
      ...this.#config,
      filterSpec,
    };

    if (filterSpec.filter === "") {
      if (hasFilter) {
        this.rowSet.clearFilter();
        this._vuuFilter = { filter: "" };
        return this.rowSet.setRange(resetRange(this.rowSet.range), false);
      }
    } else {
      const filterStruct = parseFilter(filterSpec.filter);
      //   let filterResultset;
      //   if (filter === null && _filter) {
      //     rowSet?.clearFilter();
      //   } else if (filter) {
      this.rowSet.filter(filterStruct);
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

  group(groupBy: VuuGroupBy) {
    const { rowSet } = this;
    const { groupBy: existingGroupBy } = this.#config;
    this.#config = {
      ...this.#config,
      groupBy,
    };

    if (rowSet instanceof GroupRowSet) {
      if (groupBy.length === 0) {
        this.rowSet = rowSet.toRowSet();
      } else {
        rowSet.groupBy = groupBy;
        if (
          groupByExtendsExistingGroupBy(existingGroupBy, groupBy) &&
          rowSet.expandedChildNodeCount === 0
        ) {
          // If all existing nodes are collapsed, there is no data to return
          // to client and will not be until user opens a tree node ( or scrolls)
          console.log(
            `${groupBy.join(",")} extends ${existingGroupBy.join(
              ","
            )} and there are no expanded nodes`
          );
          return;
        }
      }
    } else {
      this.rowSet = new GroupRowSet(rowSet, groupBy);
    }

    return this.rowSet.setRange(resetRange(this.rowSet.range), false);
  }

  openTreeNode(key: string) {
    if (this.rowSet instanceof GroupRowSet) {
      this.rowSet.openTreeNode(key);
      return this.rowSet.setRange(resetRange(this.rowSet.range), false);
    } else {
      throw Error(`openTreeNode called, data is not grouped`);
    }
  }

  closeTreeNode(key: string) {
    if (this.rowSet instanceof GroupRowSet) {
      this.rowSet.closeTreeNode(key);
      return this.rowSet.setRange(resetRange(this.rowSet.range), false);
    } else {
      throw Error(`closeTreeNode called, data is not grouped`);
    }
  }
}
