import type { DataTableDefinition } from "@heswell/server-types";
import fs from "fs";
import path from "path";

const path_root = "node_modules/@heswell/viewserver/dataTables";

const project_path = path.resolve(
  fs.realpathSync("."),
  `${path_root}/instruments`
);

const config: DataTableDefinition = {
  name: "instruments",
  dataPath: `${project_path}/data-generator.ts`,
  type: "vs",
  primaryKey: "ric",
  columns: [
    { name: "bbg" },
    { name: "currency" },
    { name: "description" },
    { name: "exchange" },
    { name: "ric" },
    { name: "isin" },
    { name: "lotSize", type: "int" },
  ],
};

export default config;
