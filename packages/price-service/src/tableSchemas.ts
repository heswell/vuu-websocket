import { TableSchema } from "@vuu-ui/vuu-data-types";

export const instrumentsSchema: TableSchema = {
  columns: [{ name: "ric", serverDataType: "string" }],
  key: "ric",
  table: {
    module: "PRICES",
    table: "instruments",
  },
};

export const pricesSchema: TableSchema = {
  columns: [
    { name: "ask", serverDataType: "double" },
    { name: "askSize", serverDataType: "double" }, // type: "int"
    { name: "bid", serverDataType: "double" },
    { name: "bidSize", serverDataType: "double" },
    { name: "close", serverDataType: "double" },
    { name: "last", serverDataType: "double" },
    { name: "open", serverDataType: "double" },
    { name: "phase", serverDataType: "string" },
    { name: "ric", serverDataType: "string" },
    { name: "scenario", serverDataType: "string" },
  ],
  key: "ric",
  table: {
    module: "PRICES",
    table: "prices",
  },
};
