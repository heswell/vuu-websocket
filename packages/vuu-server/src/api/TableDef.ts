import { VuuLink, VuuTable } from "@vuu-ui/vuu-protocol-types";

import TableDefContainer from "../core/module/TableDefContainer";
import { toColumnName } from "@vuu-ui/vuu-utils";
import { ViewServerModule } from "../core/module/VsModule";
import { TableSchema } from "@vuu-ui/vuu-data-types";

export type Column = {
  name: string;
  dataType: "string" | "double" | "int" | "long" | "boolean";
};

export const columnUtils = {
  allFrom: (tableDef: TableDef) => tableDef.columns.map(toColumnName),

  allFromExcept: (tableDef: TableDef, name: string) =>
    tableDef.columns.filter((td) => td.name !== name).map(toColumnName),
};

export interface TableDefConfig {
  columns: Column[];
  joinFields?: string | string[];
  keyField: string;
  name: string;
  links?: VuuLink[];
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
  links?: VuuLink[];
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

export function TableDef(options: TableDefConfig): TableDef {
  const tableDef = new TableDefImpl(options);
  return tableDef;
}

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

export interface JoinTableDef {
  baseTable: TableDef;
  joinColumns: string[];
  // eventually will be an array of Join[]
  joins: Join;
  name: string;
}

class JoinTableDefImpl implements JoinTableDef {
  joinFields?: string | string[];
  joins: Join;
  links?: VuuLink[];
  baseTable: TableDef;
  joinColumns: string[];
  name: string;
  constructor(options: JoinTableDef) {
    const { baseTable, joinColumns, joins, name } = options;
    this.baseTable = baseTable;
    this.joinColumns = joinColumns;
    this.joins = joins;
    this.name = name;
  }
}

export function JoinTableDef(options: JoinTableDef): JoinTableDef {
  return new JoinTableDefImpl(options);
}
