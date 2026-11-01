import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DIST_ROOT = path.resolve(PACKAGE_ROOT, "../../dist/user-admin");

type PackageManifest = {
  exports: {
    ".": {
      import: string;
      types: string;
    };
    "./contracts": {
      import: string;
      types: string;
    };
    "./in-memory": {
      import: string;
      types: string;
    };
  };
  main: string;
  module: string;
  types: string;
  [key: string]: unknown;
};

const sourceManifest = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"),
) as PackageManifest;

const { files: _, scripts: __, ...publishManifest } = sourceManifest;

const distManifest: PackageManifest = {
  ...publishManifest,
  main: "./index.js",
  module: "./index.js",
  types: "./src/index.d.ts",
  exports: {
    ".": {
      import: "./index.js",
      types: "./src/index.d.ts",
    },
    "./contracts": {
      import: "./contracts/index.js",
      types: "./src/contracts/index.d.ts",
    },
    "./in-memory": {
      import: "./in-memory/index.js",
      types: "./src/in-memory/index.d.ts",
    },
  },
};

fs.copyFileSync(
  path.join(PACKAGE_ROOT, "README.md"),
  path.join(DIST_ROOT, "README.md"),
);
fs.writeFileSync(
  path.join(DIST_ROOT, "package.json"),
  `${JSON.stringify(distManifest, null, 2)}\n`,
);
