import { VuuLink, VuuTable } from "@vuu-ui/vuu-protocol-types";

import { ViewServerModule } from "../core/module/VsModule";
import { TableSchema } from "@vuu-ui/vuu-data-types";

export type Column = {
  name: string;
  dataType: "string" | "double" | "int" | "long" | "boolean";
};

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
    public toColumn: string
  ) {}
}

export const Link = (
  fromColumn: string,
  toTable: string,
  toColumn: string
): Link => new LinkImpl(fromColumn, toTable, toColumn);

class VisualLinksImpl {
  constructor(public links: Link[]) {}
}

export interface VisualLinks {
  links: Link[];
}

export function VisualLinks(...links: Link[]): VisualLinks {
  return new VisualLinksImpl(links);
}

export interface TableDefConfig {
  columns: Column[];
  joinFields?: string | string[];
  keyField: string;
  name: string;
  links: VisualLinks;
}

export interface TableDef extends TableDefConfig {
  setModule: (module: ViewServerModule) => void;
  schema: TableSchema;
  asVuuTable: VuuTable;
}

class TableDefImpl implements TableDef {
  columns: Column[];
  joinFields?: string | string[];
  keyField: string;
  links: VisualLinks;
  name: string;

  #module: ViewServerModule | null = null;

  constructor(options: TableDefConfig) {
    const { columns, joinFields, keyField, name, links } = options;
    this.columns = columns;
    this.joinFields = joinFields;
    this.keyField = keyField;
    this.links = links;
    this.name = name;
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

export const TableDef = (
  options: Omit<TableDefConfig, "links"> & {
    links?: VisualLinks;
  }
): TableDef => {
  const { links = VisualLinks(), ...rest } = options;
  return new TableDefImpl({ ...rest, links });
};

export type JoinType = "LeftOuterJoin";
export interface JoinSpec {
  left: string;
  right: string;
  type: JoinType;
}
export class JoinSpecImpl implements JoinSpec {
  constructor(
    public left: string,
    public right: string,
    public type: JoinType
  ) {}
}

export function JoinSpec(
  left: string,
  right: string,
  type: JoinType
): JoinSpec {
  return new JoinSpecImpl(left, right, type);
}

export interface Join {
  table: TableDef;
  joinSpec: JoinSpec;
}

export class JoinImpl implements Join {
  constructor(public table: TableDef, public joinSpec: JoinSpec) {}
}

export function Join(table: TableDef, joinSpec: JoinSpec): Join {
  return new JoinImpl(table, joinSpec);
}

export interface JoinTableDefConfig
  extends Omit<TableDefConfig, "columns" | "keyField"> {
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
  tableDef: TableDef | JoinTableDef
): tableDef is JoinTableDef => tableDef instanceof JoinTableDefImpl;

class JoinTableDefImpl extends TableDefImpl implements JoinTableDef {
  joins: Join;
  baseTable: TableDef;
  joinColumns: Column[];
  name: string;
  constructor({
    baseTable,
    joinFields,
    joins,
    joinColumns,
    name,
    links,
  }: JoinTableDefConfig) {
    super({
      columns: joinColumns,
      joinFields,
      keyField: baseTable.keyField,
      name,
      links,
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
