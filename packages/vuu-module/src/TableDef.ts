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
