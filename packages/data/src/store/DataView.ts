import { parseFilter } from "@vuu-ui/vuu-filter-parser";
import {
  ServerMessageBody,
  VuuAggregation,
  VuuFilter,
  VuuGroupBy,
  VuuRange,
  VuuRow,
  VuuSort,
  VuuSortCol,
  VuuViewportChangeRequest,
} from "@vuu-ui/vuu-protocol-types";
import {
  EventEmitter,
  isConfigChanged,
  vanillaConfig,
  type ColumnMap,
} from "@vuu-ui/vuu-utils";
import { TableColumn } from "@heswell/vuu-server";
import { buildColumnMap, toColumn } from "./columnUtils.ts";
import { Range, resetRange } from "./rangeUtils.ts";
import { DataResponse, GroupRowSet, RowSet } from "./rowset/index.ts";
import { RowInsertHandler, RowUpdateHandler, Table } from "./table.ts";
import UpdateQueue from "./update-queue.ts";
import { DataSourceConfig, WithFullConfig } from "@vuu-ui/vuu-data-types";
import { tableRowsMessageBody } from "./responseUtils.ts";
import logger from "../logger.ts";

const EmptyFilter: Readonly<VuuFilter> = { filter: "" };

export type DataViewConfig = DataSourceConfig & {
  range: VuuRange;
};

export type SelectionEventHandler = () => void;

export declare type DataViewEvents = {
  "row-selection": SelectionEventHandler;
};

/**
 * DataView does not actually emit any events but subclasses are welcome to
 */
export default class DataView extends EventEmitter<DataViewEvents> {
  #config: WithFullConfig = vanillaConfig;
  #columnMap: ColumnMap;
  #columns: TableColumn[];
  #id: string;
  #table: Table;
  #updateQueue: UpdateQueue;

  private _vuuFilter: VuuFilter = EmptyFilter;
  private rowSet: RowSet | GroupRowSet;

  constructor(
    id: string,
    table: Table,
    { range, ...config }: DataViewConfig,
    updateQueue = new UpdateQueue()
  ) {
    super();
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
    table.on("rowDeleted", this.rowDeleted);
  }

  destroy() {
    console.log(`destroy view`);
    this.#table?.removeListener("rowUpdated", this.rowUpdated);
    this.#table?.removeListener("rowInserted", this.rowInserted);
    this.#table?.removeListener("rowDeleted", this.rowDeleted);
    this.rowSet.clear();
    //@ts-ignore
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

  get id() {
    return this.#id;
  }

  get sortDefs(): VuuSortCol[] {
    return this.#config.sort.sortDefs;
  }

  get table() {
    return this.#table;
  }

  private rowInserted: RowInsertHandler = (rowIdx, row) => {
    const { rows, size } = this.rowSet.insert(rowIdx, row);
    logger.info(
      `[DataView:${this.#table.schema.table.table}] rowInserted ${
        rows.length
      } to be returned (rowSet range ${JSON.stringify(this.rowSet.range)})`
    );
    this.enqueue(tableRowsMessageBody(rows, size, this.#id, true));
  };

  private rowDeleted: RowInsertHandler = (rowIdx, row) => {
    const { rows, size } = this.rowSet.delete(rowIdx, row);
    this.enqueue(tableRowsMessageBody(rows, size, this.#id, true));
  };

  private rowUpdated: RowUpdateHandler = (idx, updates) => {
    const { rowSet } = this;
    const dataResponse = rowSet.update(idx, updates);

    if (dataResponse) {
      if (rowSet instanceof RowSet) {
        const { rows, size } = dataResponse;
        this.enqueue(tableRowsMessageBody(rows, size, this.#id, false));
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

  getSizeRecord() {}

  getDataForCurrentRange() {
    logger.info(
      `[DataView] getDataForCurrentRange rowSet range ${JSON.stringify(
        this.rowSet.range
      )}`
    );
    return this.rowSet.currentRange();
  }

  //TODO we seem to get a setRange when we reverse sort order, is that correct ?
  setRange(range: Range, useDelta = true): DataResponse {
    logger.info(
      `[DATAVIEW] setRange ${JSON.stringify(range)}, table ${JSON.stringify(
        this.table.schema.table
      )} contains ${this.table.rowCount} rows`
    );
    return this.rowSet.setRange(range, useDelta);
  }

  select(selection: number[]): DataResponse {
    return this.rowSet.select(selection);
  }

  get selectedKeys() {
    return this.rowSet.selectedKeys;
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

    const previousSize = this.rowSet.size;

    if (filterSpec.filter === "") {
      if (hasFilter) {
        this.rowSet.clearFilter();
        this._vuuFilter = { filter: "" };
        const dataResponse = this.rowSet.setRange(
          resetRange(this.rowSet.range),
          false
        );
        return {
          ...dataResponse,
          sizeMessageRequired: this.rowSet.size !== previousSize,
        };
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

      const dataResponse = this.rowSet.setRange(
        resetRange(this.rowSet.range),
        false
      );
      return {
        ...dataResponse,
        sizeMessageRequired: this.rowSet.size !== previousSize,
      };
    }

    return { rows: [], size: -1 };
  }

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
        const requiresRender = rowSet.setGroupBy(groupBy);
        if (!requiresRender) {
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

  protected enqueue(_messageBody: ServerMessageBody) {
    console.log(`DataView enqueue should be overridden`);
  }
  protected enqueueDataMessages(
    _rows: VuuRow[],
    _vpSize: number,
    _viewPortId: string
  ) {
    console.log(`DataView enqueueDataMessages should be overridden`);
  }
}
