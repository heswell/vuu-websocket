import {
  DataTableDefinition,
  TableColumn,
  TableUpdateOptions,
} from "@heswell/server-types";
import { ColumnMap, EventEmitter } from "@vuu-ui/vuu-utils";
import { VuuDataRow, VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import { buildColumnMap } from "./columnUtils.ts";
import { TableSchema } from "@vuu-ui/vuu-data-types";

const defaultUpdateConfig: TableUpdateOptions = {
  applyUpdates: false,
  applyInserts: false,
  updateInterval: 500,
};

export type RowInsertHandler = (rowIndex: number, row: unknown) => void;
export type RowUpdateHandler = (rowIndex: number, results: unknown) => void;
export type RowRemovedHandler = (tableName: string, key: string) => void;
export type TableReadyHandler = () => void;

export type TableEvents = {
  ready: TableReadyHandler;
  rowInserted: RowInsertHandler;
  rowRemoved: RowRemovedHandler;
  rowUpdated: RowUpdateHandler;
};

export interface TableGenerators {
  createPath?: string;
  updatePath?: string;
}

export class Table extends EventEmitter<TableEvents> {
  #index: Map<string, number> = new Map();
  #keys: Record<string, number> = {};

  public columnMap: ColumnMap;
  public rows: VuuDataRow[] = [];
  public status: "ready" | null = null;
  public readonly schema: TableSchema;

  updateOptions: TableUpdateOptions = defaultUpdateConfig;

  constructor(config: DataTableDefinition) {
    super();
    const { schema, dataPath, data, updates = {} } = config;

    this.schema = schema;

    this.updateOptions = {
      ...defaultUpdateConfig,
      ...updates,
    };
    this.columnMap = buildColumnMap(schema.columns);

    // console.log(`Table
    //     columns = ${JSON.stringify(columns,null,2)}
    //     columnMap = ${JSON.stringify(this.columnMap,null,2)}
    //     `)

    if (data) {
      this.parseData(data);
    } else if (dataPath) {
      this.loadData(dataPath);
    }

    this.installDataGenerators(config);
  }

  get columns() {
    return this.schema.columns;
  }

  get name() {
    const { module, table } = this.schema.table;
    return `${module}:${table}`;
  }

  get primaryKey() {
    return this.schema.key;
  }

  /**
   *
   * @param rowIdx
   * @param updates repeating tuple of updates [colIdx, value, colIdx, value ...]
   */
  update(rowIdx: number, ...updates: VuuRowDataItemType[]) {
    const results = [];
    let row = this.rows[rowIdx];
    for (let i = 0; i < updates.length; i += 2) {
      const colIdx = updates[i] as number;
      const value = updates[i + 1];
      results.push(colIdx, row[colIdx], value);
      row[colIdx] = value;
    }
    this.emit("rowUpdated", rowIdx, results);
  }

  insert(data: VuuRowDataItemType[]) {
    const idx = this.rows.length;
    let row = this.rowFromData(idx, data);
    this.rows.push(row);
    this.emit("rowInserted", idx, row);
  }

  remove(key: string) {
    if (this.#keys[key]) {
      const index = this.#index.get(key);
      if (typeof index === "number") {
        delete this.#keys[key];
        this.#index.delete(key);
        this.rows.splice(index, 1);
        for (const [key, value] of this.#index) {
          if (value > index) {
            this.#index.set(key, value - 1);
          }
        }
        this.emit("rowRemoved", this.name, key);
      } else {
        throw Error(`Table.remove key ${key} not found`);
      }
    }
  }

  clear() {}

  async loadData(url: string) {
    fetch(url, {})
      .then((data) => data.json())
      .then((json) => {
        if (Array.isArray(json)) {
          console.log(`Table.loadData: got ${json.length} rows`);
          this.parseData(json as VuuDataRow[]);
        } else {
          throw Error("data is expected to be array");
        }
      })
      .catch((err) => {
        console.error(err);
      });
  }

  parseData(data: VuuDataRow[]) {
    console.log(`parseData ${data.length} rows`);
    const rows = [];
    for (let i = 0; i < data.length; i++) {
      let row = this.rowFromData(i, data[i]);
      rows.push(row);
    }
    this.rows = rows;

    this.status = "ready";
    this.emit("ready");
    if (this.updateOptions && this.updateOptions.applyUpdates !== false) {
      setTimeout(() => {
        this.applyUpdates();
      }, 1000);
    }
    // move this
    if (this.updateOptions && this.updateOptions.applyInserts !== false) {
      setTimeout(() => {
        this.applyInserts();
      }, 10000);
    }
  }

  rowFromData(idx: number, data: VuuDataRow) {
    // 2 metadata items for each row, the idx and unique key
    const { primaryKey, columnMap } = this;
    const key = data[columnMap[primaryKey]] as string;
    this.#index.set(key, idx);
    return [...data, idx, key];
  }

  //TODO move all these methods into an external helper
  applyInserts() {
    const idx = this.rows.length;
    this.insert(this.createRow(idx));

    setTimeout(
      () => this.applyInserts(),
      this.updateOptions.insertInterval ?? 100
    );
  }

  applyUpdates() {
    const { rows, columnMap } = this;
    // const count = Math.round(rows.length / 50);
    const count = 100;

    // for (let i = 0; i < count; i++) {
    //   const rowIdx = getRandomInt(rows.length - 1);
    //   const update = this.updateRow(rowIdx, rows[rowIdx], columnMap);
    //   if (update) {
    //     this.update(rowIdx, ...update);
    //   }
    // }

    // setTimeout(() => this.applyUpdates(), this.updateOptions.interval);
  }

  createRow(idx: number): VuuDataRow {
    throw Error(`createRow ${idx} must be implemented as a plugin`);
  }

  updateRow(/*idx, row, columnMap*/) {
    return null;
  }

  async installDataGenerators(_config: TableGenerators) {
    throw Error("Base Table does not implement installDataGenerators");
  }
}

function getRandomInt(max: number) {
  return Math.floor(Math.random() * Math.floor(max));
}
