import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DIST_ROOT = path.resolve(PACKAGE_ROOT, "../../dist/vuu-table");

// Source uses .ts import specifiers (allowImportingTsExtensions); published
// declarations must use .js so any consumer moduleResolution can follow them.
const rewriteDeclarationSpecifiers = (dir: string) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      rewriteDeclarationSpecifiers(entryPath);
    } else if (entry.name.endsWith(".d.ts")) {
      const source = fs.readFileSync(entryPath, "utf8");
      fs.writeFileSync(
        entryPath,
        source.replace(/(from\s+["']\.{1,2}\/[^"']+)\.ts(["'])/g, "$1.js$2"),
      );
    }
  }
};

rewriteDeclarationSpecifiers(path.join(DIST_ROOT, "src"));

type PackageManifest = Record<string, unknown>;

const sourceManifest = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"),
) as PackageManifest;

// devDependencies only serve the workspace build and tests.
const { devDependencies: _, scripts: __, ...publishManifest } = sourceManifest;

const distManifest: PackageManifest = {
  ...publishManifest,
  main: "./index.js",
  module: "./index.js",
  types: "./src/index.d.ts",
  exports: {
    ".": {
      types: "./src/index.d.ts",
      import: "./index.js",
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
