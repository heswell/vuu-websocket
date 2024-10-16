import { TableSchema } from "@vuu-ui/vuu-data-types";
import { TableDef } from "./ModuleFactory";

export const tableDefToSchema = (
  moduleName: string,
  { columns, name, keyField }: TableDef
): TableSchema => {
  return {
    columns: columns.map(({ name, dataType }) => ({
      name,
      serverDataType: dataType,
    })),
    key: keyField,
    table: {
      module: moduleName,
      table: name,
    },
  };
};
