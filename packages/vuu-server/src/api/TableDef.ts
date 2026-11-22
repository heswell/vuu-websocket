import { VuuColumnDataType, VuuTable } from "@vuu-ui/vuu-protocol-types";

import { ViewServerModule } from "../core/module/VsModule";
import { TableSchema } from "@vuu-ui/vuu-data-types";
import type { PermissionFunction } from "../core/filter/PermissionFilter";

export type Column = {
  name: string;
  dataType: VuuColumnDataType;
};

export const VUU_DEFAULT_COLUMNS: Column[] = [
  { name: "vuuCreatedTimestamp", dataType: "epochtimestamp" },
  { name: "vuuUpdatedTimestamp", dataType: "epochtimestamp" },
  { name: "vuuMsg", dataType: "string" },
];

export const columnUtils = {
  allFrom: (tableDef: TableDef) => tableDef.columns,

  allFromExcept: (tableDef: TableDef, name: string) =>
    tableDef.columns.filter((td) => td.name !== name),
};

export interface Link {
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

class LinkImpl implements Link {
  constructor(
    public fromColumn: string,
    public toTable: string,
    public toColumn: string,
  ) { }
}

export const Link = (
  fromColumn: string,
  toTable: string,
  toColumn: string,
): Link => new LinkImpl(fromColumn, toTable, toColumn);

class VisualLinksImpl {
  constructor(public links: Link[]) { }
}

export interface VisualLinks {
  links: Link[];
}

export function VisualLinks(...links: Link[]): VisualLinks {
  return new VisualLinksImpl(links);
}

export interface TableDefConfig {
  columns: Column[];
  /**
   * The table may be edited through a session table (createSessionTable with
   * sessionType "edit" or "import"). Default false, as in Scala Vuu.
   */
  editable?: boolean;
  joinFields?: string | string[];
  keyField: string;
  name: string;
  links: VisualLinks;
  /**
   * Creates a PermissionFilter for each viewport created on this table,
   * restricting the rows visible to the viewport user.
   */
  permissionFunction?: PermissionFunction;
}

export interface TableDef extends TableDefConfig {
  getModule: () => ViewServerModule;
  setModule: (module: ViewServerModule) => void;
  schema: TableSchema;
  asVuuTable: VuuTable;
}

/**
 * Definition of a session table "blueprint", registered with
 * `ModuleFactory.addSessionTable`. createSessionTable creates per-session
 * instances of a blueprint, chosen by name (`sessionTableName`, default
 * `<sessionType>-<sourceTable>`).
 */
export interface SessionTableDef extends TableDef {
  readonly isSessionTableDef: true;
}

export const isSessionTableDef = (
  tableDef: TableDef | undefined,
): tableDef is SessionTableDef =>
  (tableDef as Partial<SessionTableDef> | undefined)?.isSessionTableDef ===
  true;

/**
 * Columns every session table instance carries. Added to the blueprint's
 * columns when the blueprint does not define them.
 */
const SESSION_TABLE_COLUMNS: Column[] = [
  { name: "vuuMsg", dataType: "string" },
  { name: "vuuAction", dataType: "string" },
];

/**
 * The definition of a session table instance, the blueprint's definition
 * plus any of the session columns (vuuMsg, vuuAction) it does not define.
 */
export const toSessionTableInstanceDef = (
  tableDef: SessionTableDef,
): SessionTableDef => {
  const extraColumns = SESSION_TABLE_COLUMNS.filter(
    ({ name }) => !tableDef.columns.some((column) => column.name === name),
  );
  const { schema } = tableDef;
  return {
    ...tableDef,
    isSessionTableDef: true,
    getModule: () => tableDef.getModule(),
    setModule: (module: ViewServerModule) => tableDef.setModule(module),
    asVuuTable: schema.table,
    columns: [...tableDef.columns, ...extraColumns],
    schema: {
      ...schema,
      columns: [
        ...schema.columns,
        ...extraColumns.map(({ name, dataType }) => ({
          name,
          serverDataType: dataType,
        })),
      ],
    },
  };
};

/**
 * Definition of a session table created by the legacy beginEditSession
 * (without a sessionTableName): the source table's definition, keeping its
 * name, plus customColumns, the session message column (vuuMsg) and
 * vuuAction. Viewports on such a session table use the source table's
 * ServiceFactory.
 */
export const legacySessionTableDef = (
  tableDef: TableDef,
  customColumns: Column[] = [],
): SessionTableDef => {
  const extraColumns = [
    ...customColumns,
    ...SESSION_TABLE_COLUMNS.filter(
      ({ name }) =>
        !tableDef.columns.some((column) => column.name === name) &&
        !customColumns.some((column) => column.name === name),
    ),
  ];
  const { schema } = tableDef;
  return {
    ...tableDef,
    isSessionTableDef: true,
    getModule: () => tableDef.getModule(),
    setModule: (module: ViewServerModule) => tableDef.setModule(module),
    asVuuTable: schema.table,
    columns: [...tableDef.columns, ...extraColumns],
    schema: {
      ...schema,
      columns: [
        ...schema.columns,
        ...extraColumns.map(({ name, dataType }) => ({
          name,
          serverDataType: dataType,
        })),
      ],
    },
  };
};

class TableDefImpl implements TableDef {
  columns: Column[];
  joinFields?: string | string[];
  keyField: string;
  links: VisualLinks;
  name: string;
  editable: boolean;
  permissionFunction?: PermissionFunction;

  #module: ViewServerModule | null = null;

  constructor(options: TableDefConfig) {
    const {
      columns,
      editable = false,
      joinFields,
      keyField,
      name,
      links,
      permissionFunction,
    } = options;
    this.columns = columns;
    this.editable = editable;
    this.joinFields = joinFields;
    this.keyField = keyField;
    this.links = links;
    this.name = name;
    this.permissionFunction = permissionFunction;
  }
  getModule() {
    if (this.#module === null) {
      throw Error("[TableDef] getModule, module is null ");
    }
    return this.#module;
  }

  setModule(module: ViewServerModule) {
    this.#module = module;
  }

  get schema(): TableSchema {
    return {
      table: this.asVuuTable,
      columns: this.columns.map(({ name, dataType }) => ({
        name,
        serverDataType: dataType,
      })),
      key: this.keyField,
    };
  }

  get asVuuTable(): VuuTable {
    if (this.#module) {
      return {
        module: this.#module?.name,
        table: this.name,
      };
    } else {
      throw Error(`[TableDef] asVuuTable, module has not been set`);
    }
  }
}

class SessionTableDefImpl extends TableDefImpl implements SessionTableDef {
  readonly isSessionTableDef = true as const;
}

export const TableDef = (
  options: Omit<TableDefConfig, "links"> & {
    links?: VisualLinks;
  },
): TableDef => {
  const { links = VisualLinks(), ...rest } = options;
  return new TableDefImpl({ ...rest, links });
};

export const SessionTableDef = (
  options: Omit<TableDefConfig, "links"> & {
    links?: VisualLinks;
  },
): SessionTableDef => {
  const { links = VisualLinks(), ...rest } = options;
  return new SessionTableDefImpl({ ...rest, links });
};

export type JoinType = "LeftOuterJoin" | "InnerJoin";
export interface JoinSpec {
  left: string;
  right: string;
  type: JoinType;
}
export class JoinSpecImpl implements JoinSpec {
  constructor(
    public left: string,
    public right: string,
    public type: JoinType,
  ) { }
}

export function JoinSpec(
  left: string,
  right: string,
  type: JoinType,
): JoinSpec {
  return new JoinSpecImpl(left, right, type);
}

export interface Join {
  table: TableDef;
  joinSpec: JoinSpec;
}

export class JoinImpl implements Join {
  constructor(
    public table: TableDef,
    public joinSpec: JoinSpec,
  ) { }
}

export function Join(table: TableDef, joinSpec: JoinSpec): Join {
  return new JoinImpl(table, joinSpec);
}

export interface JoinTableDefConfig extends Omit<
  TableDefConfig,
  "columns" | "keyField"
> {
  baseTable: TableDef;
  joinColumns: Column[];
  joins: Join;
}

export interface JoinTableDef extends TableDef {
  baseTable: TableDef;
  containsTable: (tableName: string) => boolean;
  joinColumns: Column[];
  joins: Join;
}

export const isJoinTableDef = (
  tableDef: TableDef | JoinTableDef,
): tableDef is JoinTableDef => tableDef instanceof JoinTableDefImpl;

class JoinTableDefImpl extends TableDefImpl implements JoinTableDef {
  joins: Join;
  baseTable: TableDef;
  joinColumns: Column[];
  name: string;
  constructor({
    baseTable,
    joins,
    joinColumns,
    name,
    ...tableDefConfig
  }: JoinTableDefConfig) {
    // Pass every remaining TableDefConfig field (joinFields, links,
    // permissionFunction, ...) through to the base TableDef.
    super({
      ...tableDefConfig,
      columns: joinColumns,
      keyField: baseTable.keyField,
      name,
    });
    this.baseTable = baseTable;
    this.joinColumns = joinColumns;
    this.joins = joins;
    this.name = name;
  }

  get joinTableColumns() {
    return [];
  }

  containsTable(tableName: string) {
    if (this.baseTable.name == tableName) {
      return true;
    }
    if (this.joins.table.name === tableName) {
      return true;
    }
    return false;
  }
}

export function JoinTableDef(options: JoinTableDefConfig): JoinTableDef {
  return new JoinTableDefImpl(options);
}
