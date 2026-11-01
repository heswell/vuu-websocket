import { SchemaColumn, TableSchema } from "@vuu-ui/vuu-data-types";

const VUU_TIMESTAMP_COLUMNS: SchemaColumn[] = [
  { name: "vuuCreatedTimestamp", serverDataType: "long" },
  { name: "vuuUpdatedTimestamp", serverDataType: "long" },
];

export const instrumentsSchema: TableSchema = {
  columns: [
    { name: "bbg", serverDataType: "string" },
    { name: "currency", serverDataType: "string" },
    { name: "description", serverDataType: "string" },
    { name: "exchange", serverDataType: "string" },
    { name: "isin", serverDataType: "string" },
    { name: "lotSize", serverDataType: "int" },
    { name: "ric", serverDataType: "string" },
    ...VUU_TIMESTAMP_COLUMNS,
  ],
  key: "ric",
  // TODO module makes no sense here
  table: {
    module: "SIMUL",
    table: "instruments",
  },
};
