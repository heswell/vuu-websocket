import type {
  ColumnMap,
  RowSource,
  TableListener,
  TableSchema,
  VuuDataRow,
  VuuRowDataItemType,
} from "./types.ts";

export type ColumnDescriptor = string | { name: string; key?: number };

export function buildColumnMap(columns: readonly ColumnDescriptor[]) {
  const map: ColumnMap = {};
  for (let i = 0; i < columns.length; i++) {
    const column = columns[i];
    if (typeof column === "string") {
      map[column] = i;
    } else if (typeof column.key === "number") {
      map[column.name] = column.key;
    } else {
      map[column.name] = i;
    }
  }
  return map;
}

export interface TableDefinition {
  schema: TableSchema;
}

const NO_LISTENERS: TableListener[] = [];

/**
 * In-memory, runtime agnostic, keyed row store.
 *
 * - rows are stored densely in `rows`, index lookups by key are O(1)
 * - delete is O(1), using swap-remove (last row moves into the vacated slot)
 * - every row carries an insertion sequence number, providing a stable
 *   natural order regardless of physical position
 * - listeners are notified synchronously of every change
 */
export class Table implements RowSource {
  readonly columnMap: ColumnMap;
  readonly indexOfKeyField: number;
  readonly schema: TableSchema;

  #index = new Map<string, number>();
  #listeners: TableListener[] = NO_LISTENERS;
  #nextSeq = 0;
  #rows: VuuDataRow[] = [];
  #seq: number[] = [];
  #indexOfCreatedTs: number | undefined;
  #indexOfUpdatedTs: number | undefined;

  constructor(schemaOrDefinition: TableSchema | TableDefinition) {
    const schema =
      "schema" in schemaOrDefinition
        ? schemaOrDefinition.schema
        : schemaOrDefinition;
    this.schema = schema;
    this.columnMap = buildColumnMap(schema.columns);
    this.indexOfKeyField = this.columnMap[schema.key];
    if (this.indexOfKeyField === undefined) {
      throw Error(
        `[Table] key column ${schema.key} not found in schema for ${schema.table.table}`,
      );
    }
    this.#indexOfCreatedTs = this.columnMap.vuuCreatedTimestamp;
    this.#indexOfUpdatedTs = this.columnMap.vuuUpdatedTimestamp;
  }

  get columns() {
    return this.schema.columns;
  }

  get name() {
    return this.schema.table.table;
  }

  get primaryKey() {
    return this.schema.key;
  }

  get rowCount() {
    return this.#rows.length;
  }

  /**
   * Dense array of rows. Treat as read only, use the Table api to mutate.
   */
  get rows(): VuuDataRow[] {
    return this.#rows;
  }

  get keys(): IterableIterator<string> {
    return this.#index.keys();
  }

  addListener(listener: TableListener) {
    this.#listeners =
      this.#listeners === NO_LISTENERS
        ? [listener]
        : this.#listeners.concat(listener);
  }

  removeListener(listener: TableListener) {
    const listeners = this.#listeners.filter((l) => l !== listener);
    this.#listeners = listeners.length === 0 ? NO_LISTENERS : listeners;
  }

  get listenerCount() {
    return this.#listeners.length;
  }

  seqAt(rowIdx: number) {
    return this.#seq[rowIdx];
  }

  /**
   * Insertion sequence numbers, parallel to rows. Treat as read only.
   */
  get seq(): readonly number[] {
    return this.#seq;
  }

  rowAt(rowIdx: number): VuuDataRow {
    return this.#rows[rowIdx];
  }

  rowIndexAtKey = (key: string) => this.#index.get(key) ?? -1;

  hasKey(key: string) {
    return this.#index.has(key);
  }

  getRowAtKey(key: string, throwIfMissing?: true): VuuDataRow;
  getRowAtKey(key: string, throwIfMissing: false): VuuDataRow | undefined;
  getRowAtKey(key: string, throwIfMissing = true) {
    const rowIdx = this.#index.get(key);
    if (rowIdx !== undefined) {
      return this.#rows[rowIdx];
    } else if (throwIfMissing) {
      throw Error(`Table getRowAtKey, no row at key ${key}`);
    }
  }

  /**
   * Insert a new row. If a row with the same key exists, it is replaced
   * (treated as an update).
   *
   * @param _emitEvent retained for api compatibility. Listeners are always
   * notified, a listener that missed an insert would be inconsistent.
   */
  insert(row: VuuDataRow, _emitEvent = true) {
    const key = String(row[this.indexOfKeyField]);
    const existingIdx = this.#index.get(key);
    if (existingIdx !== undefined) {
      this.update(existingIdx, row);
      return existingIdx;
    }

    const createdTs = this.#indexOfCreatedTs;
    if (createdTs !== undefined && !row[createdTs]) {
      const ts = Date.now();
      row[createdTs] = ts;
      if (this.#indexOfUpdatedTs !== undefined) {
        row[this.#indexOfUpdatedTs] = ts;
      }
    }

    const rowIdx = this.#rows.length;
    this.#rows.push(row);
    this.#seq.push(this.#nextSeq++);
    this.#index.set(key, rowIdx);

    const listeners = this.#listeners;
    for (let i = 0; i < listeners.length; i++) {
      listeners[i].onInsert?.(rowIdx, row);
    }
    return rowIdx;
  }

  /**
   * Replace the row at rowIdx.
   */
  update(rowIdx: number, row: VuuDataRow, _columnName?: string) {
    const previous = this.#rows[rowIdx];
    if (previous === undefined) {
      throw Error(`[Table] update, no row at index ${rowIdx}`);
    }
    if (this.#indexOfUpdatedTs !== undefined) {
      row[this.#indexOfUpdatedTs] = Date.now();
    }
    this.#rows[rowIdx] = row;
    const listeners = this.#listeners;
    for (let i = 0; i < listeners.length; i++) {
      listeners[i].onUpdate?.(rowIdx, row, previous);
    }
    return true;
  }

  /**
   * Apply a partial update to the row with given key. Values are keyed by
   * column name. A new row array is created so listeners can detect
   * which columns have changed.
   */
  updateByKey(key: string, values: Record<string, VuuRowDataItemType>) {
    const rowIdx = this.#index.get(key);
    if (rowIdx === undefined) {
      throw Error(`[Table] updateByKey, no row at key ${key}`);
    }
    const row = this.#rows[rowIdx].slice();
    for (const columnName in values) {
      const colIdx = this.columnMap[columnName];
      if (colIdx !== undefined) {
        row[colIdx] = values[columnName];
      }
    }
    return this.update(rowIdx, row);
  }

  upsert(row: VuuDataRow, emitEvent = true) {
    const key = String(row[this.indexOfKeyField]);
    const rowIdx = this.#index.get(key);
    if (rowIdx === undefined) {
      this.insert(row, emitEvent);
    } else {
      this.update(rowIdx, row);
    }
  }

  delete(key: string) {
    const rowIdx = this.#index.get(key);
    if (rowIdx === undefined) {
      return false;
    }
    const rows = this.#rows;
    const seq = this.#seq;
    const row = rows[rowIdx];
    const lastIdx = rows.length - 1;
    let movedFromIdx = -1;

    this.#index.delete(key);

    if (rowIdx !== lastIdx) {
      const lastRow = rows[lastIdx];
      rows[rowIdx] = lastRow;
      seq[rowIdx] = seq[lastIdx];
      this.#index.set(String(lastRow[this.indexOfKeyField]), rowIdx);
      movedFromIdx = lastIdx;
    }
    rows.pop();
    seq.pop();

    const listeners = this.#listeners;
    for (let i = 0; i < listeners.length; i++) {
      listeners[i].onDelete?.(rowIdx, row, movedFromIdx);
    }
    return true;
  }

  clear() {
    this.#rows.length = 0;
    this.#seq.length = 0;
    this.#index.clear();
    const listeners = this.#listeners;
    for (let i = 0; i < listeners.length; i++) {
      listeners[i].onClear?.();
    }
  }

  pullRowAsArray(key: string, columns: readonly { name: string }[]) {
    const row = this.getRowAtKey(key, true);
    return columns.map((column) => row[this.columnMap[column.name]]);
  }

  getUniqueValuesForColumn(column: string, pattern?: string) {
    const colIdx = this.columnMap[column];
    if (colIdx === undefined) {
      throw Error(`[Table] getUniqueValuesForColumn no column ${column}`);
    }
    const set = new Set<string>();
    const lowercasePattern = pattern?.toLowerCase();
    for (const row of this.#rows) {
      const value = row[colIdx];
      if (value === null || value === undefined) continue;
      const strValue = String(value);
      if (
        lowercasePattern === undefined ||
        strValue.toLowerCase().startsWith(lowercasePattern)
      ) {
        set.add(strValue);
      }
    }
    return Array.from(set).sort();
  }
}
