import { TableSchema } from "@vuu-ui/vuu-data-types";
import { TableDef } from "./api/TableDef";

export const tableDefToSchema = ({
  columns,
  name,
  keyField,
}: TableDef): TableSchema => {
  return {
    columns: columns.map(({ name, dataType }) => ({
      name,
      serverDataType: dataType,
    })),
    key: keyField,
    table: {
      module: "",
      table: name,
    },
  };
};
