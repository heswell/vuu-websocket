import { TableSchema } from "@vuu-ui/vuu-data-types";

export const instrumentsSchema: TableSchema = {
  columns: [
    { name: "bbg", serverDataType: "string" },
    { name: "currency", serverDataType: "string" },
    { name: "description", serverDataType: "string" },
    { name: "exchange", serverDataType: "string" },
    { name: "isin", serverDataType: "string" },
    { name: "lotSize", serverDataType: "int" },
    { name: "ric", serverDataType: "string" },
  ],
  key: "ric",
  // TODO module makes no sense here
  table: {
    module: "SIMUL",
    table: "instruments",
  },
};
