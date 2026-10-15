import {
  Table as EngineTable,
  JoinTable,
  type TableListener,
} from "@heswell/vuu-table";
import type { TableSchema } from "@vuu-ui/vuu-data-types";
import type {
  VuuDataRow,
  VuuRowDataItemType,
} from "@vuu-ui/vuu-protocol-types";
import { type ColumnMap, EventEmitter } from "@vuu-ui/vuu-utils";
import type { UpdateGenerator } from "./rowUpdates";

export type TableRow = Array<VuuRowDataItemType | bigint>;

export type RangeLimits = NonNullable<TableSchema["rangeLimits"]>;

const defaultRangeLimits = new WeakMap<Table<EngineTable>, RangeLimits>();

/**
 * @internal Range limits applied when the table's schema declares none,
 * without adding them to the (exposed) schema.
 */
export const setDefaultRangeLimits = (
  table: Table<EngineTable>,
  rangeLimits: RangeLimits,
) => {
  defaultRangeLimits.set(table, rangeLimits);
};

export type TableEvents = {
  delete: (key: string) => void;
  insert: (row: TableRow) => void;
  update: (row: TableRow, columnName?: string, sessionId?: string) => void;
};

/**
 * Module-facing table API, backed by an `@heswell/vuu-table` engine Table.
 *
 * Rows are stored by the engine. Note that deletes are swap-remove, so the
 * order of `data` is insertion order only until the first delete.
 *
 * Events are emitted from engine table listeners, so changes applied
 * directly to the engine table (e.g. by a JoinTable) are also observed.
 *
 * `E` is the type of the engine table, `JoinTable` for tables created by
 * `createJoinTable` (see `JoinTableHandle`).
 */
export class Table<
  E extends EngineTable = EngineTable,
> extends EventEmitter<TableEvents> {
  readonly engineTable: E;
  #dataMap: ColumnMap;
  #destroyed = false;
  #indexOfKey: number;
  #listener: TableListener;
  #updateColumnName: string | undefined;

  constructor(
    schemaOrEngineTable: TableSchema | E,
    data: TableRow[] = [],
    dataMap?: ColumnMap,
    updateGenerator?: UpdateGenerator,
  ) {
    super();
    this.engineTable =
      schemaOrEngineTable instanceof EngineTable
        ? schemaOrEngineTable
        : (new EngineTable(schemaOrEngineTable) as E);
    this.#dataMap = dataMap ?? this.engineTable.columnMap;
    this.#indexOfKey = this.engineTable.indexOfKeyField;

    for (const row of data) {
      this.engineTable.insert(row as VuuDataRow);
    }

    this.#listener = {
      onInsert: (_rowIdx, row) => this.emit("insert", row),
      onUpdate: (_rowIdx, row) =>
        this.emit("update", row, this.#updateColumnName),
      onDelete: (_rowIdx, row) =>
        this.emit("delete", String(row[this.#indexOfKey])),
      onClear: () => undefined,
    };
    this.engineTable.addListener(this.#listener);

    updateGenerator?.setTable(this);
    updateGenerator?.setRange({ from: 0, to: 100 });
  }

  get data(): TableRow[] {
    return this.engineTable.rows;
  }

  get map() {
    return this.#dataMap;
  }

  get schema() {
    return this.engineTable.schema;
  }

  /**
   * The range limits in effect: those of the schema if it declares any,
   * otherwise any engine default (applied to join tables), else undefined
   * (unlimited). Never added to `schema`.
   */
  get rangeLimits(): RangeLimits | undefined {
    return this.schema.rangeLimits ?? defaultRangeLimits.get(this);
  }

  get destroyed() {
    return this.#destroyed;
  }

  /**
   * Release the table. For a join table this detaches the join from its
   * source tables, so source changes no longer propagate. This table stops
   * emitting events. Safe to call on any table, and more than once.
   */
  destroy() {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.engineTable.removeListener(this.#listener);
    if (this.engineTable instanceof JoinTable) {
      this.engineTable.destroy();
    }
  }

  get name() {
    return this.engineTable.name;
  }

  get rowCount() {
    return this.engineTable.rowCount;
  }

  delete(key: string) {
    if (!this.engineTable.delete(key)) {
      throw Error(`[Table] delete key ${key} not found`);
    }
  }

  /**
   * @param _emitEvent retained for compatibility with vuu-data-test, the
   * engine always notifies dependent viewports of an insert.
   */
  insert(row: TableRow, _emitEvent = true) {
    const ts = Date.now();
    const { vuuCreatedTimestamp, vuuUpdatedTimestamp } = this.#dataMap;
    if (vuuUpdatedTimestamp !== undefined) row[vuuUpdatedTimestamp] = ts;
    if (vuuCreatedTimestamp !== undefined) row[vuuCreatedTimestamp] = ts;
    this.engineTable.insert(row as VuuDataRow);
  }

  findByKey(key: string): TableRow | undefined {
    return this.engineTable.getRowAtKey(key, false);
  }

  update(key: string, columnName: string, value: bigint | VuuRowDataItemType) {
    const rowIdx = this.engineTable.rowIndexAtKey(key);
    if (rowIdx !== -1) {
      const newRow: TableRow = this.engineTable.rows[rowIdx].slice();
      newRow[this.#dataMap[columnName]] = value;
      this.#updateColumnName = columnName;
      try {
        this.engineTable.update(rowIdx, newRow as VuuDataRow);
      } finally {
        this.#updateColumnName = undefined;
      }
    }
  }

  updateRow(row: TableRow) {
    const rowIdx = this.engineTable.rowIndexAtKey(
      String(row[this.#indexOfKey]),
    );
    if (rowIdx !== -1) {
      this.engineTable.update(rowIdx, row as VuuDataRow);
    }
  }
}

export function buildDataColumnMapFromSchema(schema: Readonly<TableSchema>) {
  const map: ColumnMap = {};
  schema.columns.forEach((col, index) => {
    map[col.name] = index;
  });
  return map;
}

/**
 * Build a data ColumnMap for a table in the provided schema.
 * A data ColumnMap is a mapping from a raw data array to a map, keyed
 * by column name with no additional metadata.
 */
export function buildDataColumnMap<TableName extends string = string>(
  schemas: Readonly<Record<TableName, Readonly<TableSchema>>>,
  tableName: TableName,
) {
  return buildDataColumnMapFromSchema(schemas[tableName]);
}
