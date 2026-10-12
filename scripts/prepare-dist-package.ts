import fs from "node:fs";
import path from "node:path";

type PackageManifest = Record<string, unknown>;

export interface DistEntry {
  /** Export subpath, e.g. "." or "./main". */
  subpath: string;
  /** Built entry name, as configured in rslib (index, main, ...). */
  name: string;
}

export interface PrepareDistPackageOptions {
  packageRoot: string;
  distRoot: string;
  entries: DistEntry[];
  /** Built bin entry names keyed by command name, e.g. { "vuu-portal": "bin" }. */
  bin?: Record<string, string>;
}

// Declarations keep the source's relative specifiers, which are extensionless
// or end in .ts. Under moduleResolution node16/nodenext, relative ESM imports
// need a real file extension, so point each one at the .js file (or the
// directory's index.js) that the matching .d.ts describes.
const RELATIVE_SPECIFIER =
  /((?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)["'])(\.{1,2}(?:\/[^"']*)?)(["'])/g;

const resolveDeclarationSpecifier = (fromDir: string, specifier: string) => {
  const bare = specifier.replace(/\.(?:ts|js)$/, "").replace(/\/$/, "");
  if (fs.existsSync(path.join(fromDir, `${bare}.d.ts`))) {
    return `${bare}.js`;
  }
  if (fs.existsSync(path.join(fromDir, bare, "index.d.ts"))) {
    return `${bare}/index.js`;
  }
  throw Error(
    `prepareDistPackage: cannot resolve '${specifier}' from declarations in ${fromDir}`,
  );
};

export const rewriteDeclarationSpecifiers = (dir: string) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      rewriteDeclarationSpecifiers(entryPath);
    } else if (entry.name.endsWith(".d.ts")) {
      const source = fs.readFileSync(entryPath, "utf8");
      fs.writeFileSync(
        entryPath,
        source.replace(
          RELATIVE_SPECIFIER,
          (_match, prefix: string, specifier: string, quote: string) =>
            `${prefix}${resolveDeclarationSpecifier(dir, specifier)}${quote}`,
        ),
      );
    }
  }
};

/**
 * Turns an rslib build in dist/<package> into a publishable package: built
 * JS entries, declarations under src/, and a manifest that points at them.
 */
export const prepareDistPackage = ({
  packageRoot,
  distRoot,
  entries,
  bin,
}: PrepareDistPackageOptions) => {
  rewriteDeclarationSpecifiers(path.join(distRoot, "src"));

  const sourceManifest = JSON.parse(
    fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
  ) as PackageManifest;

  // devDependencies and scripts only serve the workspace build and tests;
  // typesVersions and bin point at source files.
  const {
    devDependencies: _devDependencies,
    scripts: _scripts,
    typesVersions: _typesVersions,
    bin: _bin,
    ...publishManifest
  } = sourceManifest;

  const types = (name: string) => `./src/${name}.d.ts`;
  const js = (name: string) => `./${name}.js`;
  const root = entries.find(({ subpath }) => subpath === ".");
  if (!root) throw Error("prepareDistPackage: a root (.) entry is required");

  const subpathEntries = entries.filter(({ subpath }) => subpath !== ".");
  const binFiles = Object.values(bin ?? {}).map(js);

  const distManifest: PackageManifest = {
    ...publishManifest,
    main: js(root.name),
    module: js(root.name),
    types: types(root.name),
    exports: {
      ...Object.fromEntries(
        entries.map(({ subpath, name }) => [
          subpath,
          { types: types(name), import: js(name) },
        ]),
      ),
      "./package.json": "./package.json",
    },
    ...(subpathEntries.length > 0
      ? {
          // For consumers on moduleResolution node10, which ignores exports.
          typesVersions: {
            "*": Object.fromEntries(
              subpathEntries.map(({ subpath, name }) => [
                subpath.replace(/^\.\//, ""),
                [types(name)],
              ]),
            ),
          },
        }
      : {}),
    ...(bin
      ? {
          bin: Object.fromEntries(
            Object.entries(bin).map(([command, name]) => [command, js(name)]),
          ),
        }
      : {}),
    sideEffects: binFiles.length > 0 ? binFiles : false,
    files: ["*.js", "src/**/*.d.ts", "README.md"],
  };

  fs.copyFileSync(
    path.join(packageRoot, "README.md"),
    path.join(distRoot, "README.md"),
  );
  fs.writeFileSync(
    path.join(distRoot, "package.json"),
    `${JSON.stringify(distManifest, null, 2)}\n`,
  );
};
