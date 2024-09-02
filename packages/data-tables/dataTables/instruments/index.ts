import type { DataTableDefinition } from "@heswell/server-types";
import fs from "fs";
import path from "path";

const path_root = "node_modules/@heswell/data-tables/dataTables";

const project_path = path.resolve(
  fs.realpathSync("."),
  `${path_root}/instruments`
);

const config: DataTableDefinition = {
  dataPath: `${project_path}/data-generator.ts`,
  schema: {
    columns: [
      { name: "bbg", serverDataType: "string" },
      { name: "currency", serverDataType: "string" },
      { name: "description", serverDataType: "string" },
      { name: "exchange", serverDataType: "string" },
      { name: "ric", serverDataType: "string" },
      { name: "isin", serverDataType: "string" },
      { name: "lotSize", serverDataType: "int" },
    ],
    key: "ric",
    table: {
      module: "SIMUL",
      table: "instruments",
    },
  },
};

export default config;
