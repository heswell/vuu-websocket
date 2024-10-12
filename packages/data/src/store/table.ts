import { DataTableDefinition } from "@heswell/server-types";
import { TableSchema } from "@vuu-ui/vuu-data-types";
import { buildColumnMap } from "./columnUtils.ts";
import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import { ColumnMap, EventEmitter } from "@vuu-ui/vuu-utils";

const defaultUpdateConfig: TableUpdateOptions = {
  applyUpdates: false,
  applyInserts: false,
  updateInterval: 500,
};

// export type TableIndex = Map<string, number>;
export type TableIndex = Record<string, number>;

export type UpdateTuples = VuuDataRow[];
export type RowInsertHandler = (rowIndex: number, row: unknown) => void;
export type RowUpdateHandler = (
  rowIndex: number,
  results: UpdateTuples
) => void;
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

export type TableRow = [VuuDataRow, ...VuuDataRow[], number, string];

export class Table extends EventEmitter<TableEvents> {
  // #index: TableIndex = new Map<string, number>();
  #index: TableIndex = {};
  #keys: Record<string, number> = {};

  public columnMap: ColumnMap;
  public rows: VuuDataRow[] = [];
  public status: "ready" | null = null;
  public readonly schema: TableSchema;

  constructor({ schema }: DataTableDefinition) {
    super();

    this.schema = schema;

    this.columnMap = buildColumnMap(schema.columns);
  }

  get columns() {
    return this.schema.columns;
  }
  get index() {
    return this.#index;
  }

  get name() {
    return this.schema.table.table;
  }

  get primaryKey() {
    return this.schema.key;
  }

  get rowCount() {
    return this.rows.length;
  }

  getUniqueValuesForColumn(column: string, pattern?: string) {
    const colIdx = this.columnMap[column];
    const schemaColumn = this.schema.columns.find((col) => col.name === column);
    if (schemaColumn) {
      if (schemaColumn.serverDataType === "string") {
        const set = new Set<string>();
        if (pattern) {
          const lowercasePattern = pattern.toLocaleLowerCase();
          for (const row of this.rows) {
            const value = row[colIdx] as string;
            if (value.toLocaleLowerCase().startsWith(lowercasePattern)) {
              set.add(value);
            }
          }
        } else {
          for (const row of this.rows) {
            const value = row[colIdx] as string;
            set.add(value);
          }
        }
        return Array.from(set).sort();
      } else {
        throw Error(
          `Table. getUniqueValuesForColumn only operates on string colmns, ${column} is a ${schemaColumn.serverDataType}`
        );
      }
    } else {
      throw Error(`Table. getUniqueValuesForColumn no column ${column}`);
    }
  }

  /**
   *
   * @param rowIdx
   * @param updates repeating tuple of updates [colIdx, value, colIdx, value ...]
   */
  update(rowIdx: number, ...updates: VuuDataRow[]) {
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

  insert(row: VuuDataRow, emitEvent = true) {
    const rowIdx = this.rows.length;
    const indexOfKeyValue = this.columnMap[this.primaryKey];
    const key = row[indexOfKeyValue];
    this.#index[key.toString()] = rowIdx;
    this.rows.push(row);
    if (emitEvent) {
      this.emit("rowInserted", rowIdx, row);
    }
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
}
