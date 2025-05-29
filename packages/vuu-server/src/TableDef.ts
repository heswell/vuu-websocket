import { VuuLink } from "@vuu-ui/vuu-protocol-types";

export type Column = {
  name: string;
  dataType: "string" | "double" | "int" | "long" | "boolean";
};

export interface TableDef {
  columns: Column[];
  joinFields?: string | string[];
  keyField: string;
  name: string;
  links?: VuuLink[];
}

class TableDefImpl implements TableDef {
  columns: Column[];
  joinFields?: string | string[];
  keyField: string;
  links?: VuuLink[];
  name: string;
  constructor(options: TableDef) {
    const { columns, joinFields, keyField, name, links } = options;
    this.columns = columns;
    this.joinFields = joinFields;
    this.keyField = keyField;
    this.links = links;
    this.name = name;
  }
}

export function TableDef(options: TableDef): TableDef {
  return new TableDefImpl(options);
}
