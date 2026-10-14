import { JoinTable, type JoinType } from "@heswell/vuu-table";
import type { SchemaColumn, TableSchema } from "@vuu-ui/vuu-data-types";
import { buildDataColumnMapFromSchema, Table } from "../../Table";
import type { VuuRowDataItemType, VuuTable } from "@vuu-ui/vuu-protocol-types";
import type { ColumnMap } from "@vuu-ui/vuu-utils";
import type { UpdateGenerator } from "../../rowUpdates";

const DEFAULT_RANGE_LIMITS = {
  maxRangeEnd: 1_000_000,
  maxRangeWidth: 1_000,
};

const tableKey = ({ module, table }: VuuTable) => `${module}:${table}`;

/**
 * Create a table. The table is not registered anywhere; it belongs to
 * whichever VuuModule returns it from `tables`.
 */
export const createTable = (
  schema: TableSchema,
  data: Array<Array<VuuRowDataItemType | bigint>> = [],
  dataMap: ColumnMap = buildDataColumnMapFromSchema(schema),
  updateGenerator?: UpdateGenerator,
) => new Table(schema, data, dataMap, updateGenerator);

export interface CreateJoinTableOptions {
  /** Defaults to "inner". */
  joinType?: JoinType;
  /**
   * Ordered column names of the join table, possibly a subset of the columns
   * of the two source tables. Must include the key column of table1. Types
   * are taken from the source tables. Defaults to every column of both
   * tables, in alphabetical order.
   */
  columns?: readonly string[];
  /**
   * Declared schema of the join table, e.g. the schema a Vuu server would
   * return in TABLE_META_RESP. Its column order is preserved; every column
   * must exist in one of the source tables, with the same serverDataType, and
   * its key must be the key of table1. Cannot be combined with `columns`.
   */
  schema?: TableSchema;
}

/**
 * Create a materialized join of two tables, backed by an engine JoinTable,
 * maintained incrementally as either source changes. `joinType` defaults to
 * "inner" (only rows with a match in table2). With "leftOuter" every table1
 * row is present and unmatched table2 columns are null, as in vuu-server.
 *
 * The fifth argument is either a JoinType or a CreateJoinTableOptions, which
 * can also control the columns (and their order) of the join table. Where a
 * column exists in both tables, the value comes from table1.
 */
export const createJoinTable = (
  joinTable: VuuTable,
  table1: Table,
  table2: Table,
  joinColumn: string,
  joinTypeOrOptions: JoinType | CreateJoinTableOptions = "inner",
) => {
  const {
    joinType = "inner",
    columns,
    schema,
  }: CreateJoinTableOptions = typeof joinTypeOrOptions === "string"
    ? { joinType: joinTypeOrOptions }
    : joinTypeOrOptions;

  const engineJoinTable = new JoinTable({
    schema: buildJoinSchema(joinTable, table1.schema, table2.schema, {
      columns,
      schema,
    }),
    baseTable: table1.engineTable,
    joinTable: table2.engineTable,
    leftColumn: joinColumn,
    rightColumn: joinColumn,
    joinType,
  });

  return new Table(engineJoinTable);
};

const buildJoinSchema = (
  joinTable: VuuTable,
  schema1: TableSchema,
  schema2: TableSchema,
  { columns, schema }: Pick<CreateJoinTableOptions, "columns" | "schema">,
): TableSchema => {
  const name = `${joinTable.module}:${joinTable.table}`;
  const fail = (message: string): never => {
    throw Error(`[createJoinTable] ${name}: ${message}`);
  };
  if (columns && schema) {
    fail("pass either columns or schema, not both");
  }
  if (schema) {
    const { module, table } = schema.table;
    if (module !== joinTable.module || table !== joinTable.table) {
      fail(`schema is for table ${module}:${table}`);
    }
    if (schema.key !== schema1.key) {
      fail(
        `schema key ${schema.key} must be the key of ${schema1.table.table} (${schema1.key})`,
      );
    }
  }

  const sourceColumns = new Set(
    [...schema1.columns, ...schema2.columns].map((col) => col.name),
  );
  const columnNames =
    schema?.columns.map((col) => col.name) ??
    columns ??
    Array.from(sourceColumns).sort();

  const seen = new Set<string>();
  for (const columnName of columnNames) {
    if (!sourceColumns.has(columnName)) {
      fail(
        `unknown column ${columnName}, not in ${schema1.table.table} or ${schema2.table.table}`,
      );
    }
    if (seen.has(columnName)) {
      fail(`duplicate column ${columnName}`);
    }
    seen.add(columnName);
  }
  if (!seen.has(schema1.key)) {
    fail(`columns must include the key column ${schema1.key}`);
  }

  const joinColumns = columnNames.map<SchemaColumn>((columnName) => ({
    name: columnName,
    serverDataType: getServerDataType(columnName, schema1, schema2),
  }));

  if (schema) {
    schema.columns.forEach(({ name: columnName, serverDataType }, i) => {
      if (serverDataType !== joinColumns[i].serverDataType) {
        fail(
          `column ${columnName} is declared ${serverDataType} but is ${joinColumns[i].serverDataType} in the source table`,
        );
      }
    });
    return {
      ...schema,
      rangeLimits: schema.rangeLimits ?? DEFAULT_RANGE_LIMITS,
    };
  }

  return {
    key: schema1.key,
    table: joinTable,
    rangeLimits: DEFAULT_RANGE_LIMITS,
    columns: joinColumns,
  };
};

/**
 * Tables, keyed by `{module, table}`. Each LocalEngine owns one, populated
 * from the tables of its registered modules. Tables created through
 * `createTable` / `createJoinTable` are added to this container.
 */
export class TableContainer {
  #tables = new Map<string, Table>();

  createTable = (
    schema: TableSchema,
    data: Array<Array<VuuRowDataItemType | bigint>> = [],
    dataMap: ColumnMap = buildDataColumnMapFromSchema(schema),
    updateGenerator?: UpdateGenerator,
  ) => {
    const table = createTable(schema, data, dataMap, updateGenerator);
    this.addTable(table);
    return table;
  };

  /**
   * Create a join of two tables already in this container. Pass full
   * `{module, table}` references; a bare name is accepted only if unique.
   */
  createJoinTable(
    joinTable: VuuTable,
    table1: VuuTable | string,
    table2: VuuTable | string,
    joinColumn: string,
    joinTypeOrOptions: JoinType | CreateJoinTableOptions = "inner",
  ) {
    const newTable = createJoinTable(
      joinTable,
      this.getTable(table1),
      this.getTable(table2),
      joinColumn,
      joinTypeOrOptions,
    );
    this.addTable(newTable);
    return newTable;
  }

  /**
   * Add a table, keyed by `as` if given, otherwise by its schema's
   * `{module, table}`.
   */
  addTable(table: Table, as: VuuTable = table.schema.table) {
    this.#tables.set(tableKey(as), table);
  }

  removeTable(table: VuuTable) {
    return this.#tables.delete(tableKey(table));
  }

  hasTable(table: VuuTable) {
    return this.#tables.has(tableKey(table));
  }

  /**
   * Resolve a table by `{module, table}`. A bare table name is accepted for
   * backward compatibility, but only resolves if exactly one module has a
   * table with that name.
   */
  getTable(table: VuuTable | string): Table;
  getTable<T>(table: VuuTable | string): T;
  getTable<T = Table>(table: VuuTable | string): T {
    if (typeof table === "string") {
      const matches = Array.from(this.#tables.keys()).filter((key) =>
        key.endsWith(`:${table}`),
      );
      if (matches.length === 1) {
        return this.#tables.get(matches[0]) as T;
      } else if (matches.length > 1) {
        throw Error(
          `[TableContainer] table name ${table} is ambiguous (${matches.join(", ")}), use {module, table}`,
        );
      }
      throw Error(`[TableContainer] no table ${table}`);
    }
    const found = this.#tables.get(tableKey(table));
    if (found) {
      return found as T;
    }
    throw Error(`[TableContainer] no table ${tableKey(table)}`);
  }

  get tables(): Table[] {
    return Array.from(this.#tables.values());
  }

  clear() {
    this.#tables.clear();
  }
}

const getServerDataType = (
  columnName: string,
  { columns: cols1, table: t1 }: TableSchema,
  { columns: cols2, table: t2 }: TableSchema,
) => {
  const col1 = cols1.find((col) => col.name === columnName);
  const col2 = cols2.find((col) => col.name === columnName);
  if (col1 && col2) {
    if (col1.serverDataType === col2.serverDataType) {
      return col1.serverDataType;
    } else {
      throw Error(
        `both tables ${t1.table} and ${t2.table} implement column ${columnName}, but with types differ`,
      );
    }
  } else if (col1) {
    return col1.serverDataType;
  } else if (col2) {
    return col2.serverDataType;
  } else {
    throw Error("how is this possible");
  }
};
