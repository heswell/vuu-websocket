import type { DataTableDefinition } from "@heswell/server-types";
import fs from "fs";
import path from "path";

const path_root = "node_modules/@heswell/data-tables/dataTables";

const project_path = path.resolve(
  fs.realpathSync("."),
  `${path_root}/test-instruments`
);

const config: DataTableDefinition = {
  dataPath: `${project_path}/data.ts`,
  schema: {
    columns: [
      { name: "Symbol", serverDataType: "string" },
      { name: "Name", serverDataType: "string" },
      { name: "Price", serverDataType: "double" },
      { name: "MarketCap", serverDataType: "long" },
      { name: "IPO", serverDataType: "string" },
      { name: "Sector", serverDataType: "string" },
      { name: "Industry", serverDataType: "int" },
    ],
    key: "Symbol",
    table: {
      module: "TEST",
      table: "testInstruments",
    },
  },
};

export default config;
