import { DataTableDefinition } from "@heswell/vuu-server";
import { TableSchema } from "@vuu-ui/vuu-data-types";
import { buildColumnMap } from "./columnUtils.ts";
import { VuuDataRow, VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import { ColumnMap, EventEmitter } from "@vuu-ui/vuu-utils";
import logger from "../logger.ts";

// export type TableIndex = Map<string, number>;
export type TableIndex = Record<string, number | undefined>;

/**
 * repeating tuple of pairs of update values [colIdx, value, colIdx, value ...]
 */
export type UpdateTuple = [] | [number, VuuRowDataItemType];

/**
 * repeating tuple of triples of updated values [colIdx, originalValue, updatedeValue, colIdx, value ...]
 */
export type UpdateResultTuple =
  | []
  | [number, VuuRowDataItemType, VuuRowDataItemType];

export type RowInsertHandler = (rowIndex: number, row: VuuDataRow) => void;
export type RowUpdateHandler = (
  rowIndex: number,
  results: UpdateResultTuple
) => void;
export type RowDeletedHandler = (rowIndex: number, row: VuuDataRow) => void;
export type TableReadyHandler = () => void;

export type TableEvents = {
  ready: TableReadyHandler;
  rowInserted: RowInsertHandler;
  rowDeleted: RowDeletedHandler;
  rowUpdated: RowUpdateHandler;
};

export interface TableGenerators {
  createPath?: string;
  updatePath?: string;
}

export type TableRow = [VuuDataRow, ...VuuDataRow[], number, string];

export class Table extends EventEmitter<TableEvents> {
  #index: TableIndex = {};

  public columnMap: ColumnMap;
  public rows: VuuDataRow[] = [];
  public status: "ready" | null = null;
  public readonly schema: TableSchema;

  private readonly indexOfKeyField: number;

  constructor({ schema }: DataTableDefinition) {
    super();

    const columnMap = buildColumnMap(schema.columns);

    this.schema = schema;
    this.columnMap = columnMap;
    this.indexOfKeyField = columnMap[schema.key];
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

  update(rowIdx: number, updates: UpdateTuple, clientInitiated = false) {
    const results = [] as UpdateResultTuple;
    let row = this.rows[rowIdx];
    for (let i = 0, j = 0; i < updates.length; i += 2, j += 3) {
      const colIdx = updates[i] as number;
      const value = updates[i + 1];
      results[j] = colIdx;
      results[j + 1] = row[colIdx];
      results[j + 2] = row[colIdx] = value;
    }

    if (clientInitiated) {
      setTimeout(() => {
        // we delay this so that confirmation is sent to client before row update
        this.emit("rowUpdated", rowIdx, results);
      }, 15);
    } else {
      this.emit("rowUpdated", rowIdx, results);
    }
    return true;
  }

  // assume for now both rows use same columnMap, otw we would
  // have to pass in columnMap for newRow
  upsert(newRow: VuuDataRow, emitEvent = true) {
    const { indexOfKeyField } = this;
    const key = newRow[indexOfKeyField] as string;
    const rowIdx = this.rowIndexAtKey(key);
    if (rowIdx === -1) {
      this.insert(newRow, emitEvent);
    } else {
      const row = this.rows[rowIdx];

      const results = [] as UpdateResultTuple;
      for (let i = 0, pos = 0; i < newRow.length; i++) {
        if (i !== indexOfKeyField && newRow[i] !== row[i]) {
          results[pos] = i;
          results[pos + 1] = row[i];
          results[pos + 2] = row[i] = newRow[i];
          pos += 2;
        }
      }

      if (emitEvent && results.length > 0) {
        this.emit("rowUpdated", rowIdx, results);
      }
    }
  }

  insert(row: VuuDataRow, emitEvent = true) {
    const indexOfKeyValue = this.columnMap[this.primaryKey];
    const key = row[indexOfKeyValue];
    const rowIdx = this.rows.push(row) - 1;
    this.#index[key.toString()] = rowIdx;
    logger.info(
      `[Table] ${this.schema.table.module}:${this.schema.table.table}, insert [${rowIdx}] publish ? ${emitEvent} rows lonegh ${this.rows.length}`
    );
    if (emitEvent) {
      this.emit("rowInserted", rowIdx, row);
    }
  }

  rowIndexAtKey = (key: string) => this.#index[key] ?? -1;

  getRowAtKey(key: string, throwIfMissing?: true): VuuDataRow;
  getRowAtKey(key: string, throwIfMissing: false): VuuDataRow | undefined;
  getRowAtKey(key: string, throwIfMissing = true) {
    const row = this.rows[this.rowIndexAtKey(key)];
    if (row) {
      return row;
    } else if (throwIfMissing) {
      throw Error(`Table getRowAtKey, no row at key ${key}`);
    }
  }

  // TODO what do we do about rowIndex values when we remove ?
  delete(key: string) {
    if (this.#index[key]) {
      const rowIdx = this.#index[key];
      if (typeof rowIdx === "number" && rowIdx !== -1) {
        this.#index[key] = undefined;
        const [row] = this.rows.splice(rowIdx, 1);
        const start = performance.now();
        for (const key of Object.keys(this.#index)) {
          const value = this.#index[key];
          if (value !== undefined && value > rowIdx) {
            this.#index[key] = value - 1;
          }
        }
        const end = performance.now();
        console.log(`updating index after delete took ${end - start} ms`);
        this.emit("rowDeleted", rowIdx, row);
      } else {
        throw Error(`Table.remove key ${key} not found`);
      }
    }
  }

  clear() {}

  createRow(idx: number): VuuDataRow {
    throw Error(`createRow ${idx} must be implemented as a plugin`);
  }

  updateRow(/*idx, row, columnMap*/) {
    return null;
  }
}
