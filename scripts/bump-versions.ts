import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PUBLISHABLE_PACKAGE_NAME,
  updateDependencies,
} from "./publishable-packages";
import { getWorkspacePackages } from "./workspace-packages";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES_ROOT = path.join(ROOT, "packages");
const VERSION_PATTERN =
  /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta)\.(\d+))?$/;

type PackageJson = {
  name?: string;
  version?: string;
  [key: string]: unknown;
};

const printHelp = () => {
  console.log(`Usage: npm run bump:versions -- [options]

Updates ${DEFAULT_PUBLISHABLE_PACKAGE_NAME} by default, or the package selected with
--package. Root and workspace dependencies on the selected package are also updated.

Without --version, increments the patch version. For alpha or beta releases,
the prerelease number is incremented instead.

Options:
  --package <name>  Select any workspace package by its package.json name.
  --version=<version>
                    Set the package version explicitly.
  --help            Print this help message.

Versions must be n.n.n, n.n.n-alpha.n, or n.n.n-beta.n.`);
};

const readJson = (filePath: string): PackageJson =>
  JSON.parse(fs.readFileSync(filePath, "utf8")) as PackageJson;

const writeJson = (filePath: string, json: PackageJson) => {
  fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);
};

const parseVersion = (version: string) => {
  const match = VERSION_PATTERN.exec(version);
  if (!match) {
    throw new Error(
      `Invalid version "${version}". Expected n.n.n, n.n.n-alpha.n, or n.n.n-beta.n.`,
    );
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    channel: match[4],
    prerelease: match[5] === undefined ? undefined : Number(match[5]),
  };
};

const incrementVersion = (version: string) => {
  const parsed = parseVersion(version);
  if (parsed.channel) {
    return `${parsed.major}.${parsed.minor}.${parsed.patch}-${parsed.channel}.${parsed.prerelease! + 1}`;
  }

  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
};

const getOptions = () => {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  let packageName: string = DEFAULT_PUBLISHABLE_PACKAGE_NAME;
  let version: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    const flag = argument.split("=")[0];
    if (flag === "--package" || flag === "--version") {
      const value = argument.startsWith(`${flag}=`)
        ? argument.slice(flag.length + 1)
        : args[++index];
      if (!value || value.startsWith("--")) {
        throw new Error(`The ${flag} option requires a value.`);
      }
      if (flag === "--package") packageName = value;
      else version = value;
      continue;
    }
    throw new Error(
      `Unknown argument "${argument}". Use --package=<name>, --version=<version>, or --help.`,
    );
  }

  return { packageName, version };
};

const { packageName: targetPackageName, version: requestedVersion } = getOptions();
const packageFiles = getWorkspacePackages().map(({ directory }) =>
  path.join(PACKAGES_ROOT, directory, "package.json"),
);
const targetPackageFile = packageFiles.find(
  (filePath) => readJson(filePath).name === targetPackageName,
);
if (!targetPackageFile) {
  throw new Error(`Could not find ${targetPackageName} in ${PACKAGES_ROOT}.`);
}

const targetPackage = readJson(targetPackageFile);
if (!targetPackage.version) {
  throw new Error(`${targetPackageName} does not have a version.`);
}

const version = requestedVersion ?? incrementVersion(targetPackage.version);
parseVersion(version);

const changedFiles: string[] = [];
for (const filePath of [path.join(ROOT, "package.json"), ...packageFiles]) {
  const json = filePath === targetPackageFile ? targetPackage : readJson(filePath);
  let changed = false;

  if (filePath === targetPackageFile && json.version !== version) {
    json.version = version;
    changed = true;
  }

  changed = updateDependencies(json, targetPackageName, version) || changed;
  if (changed) {
    writeJson(filePath, json);
    changedFiles.push(path.relative(ROOT, filePath));
  }
}

const lockfilePath = path.join(ROOT, "package-lock.json");
if (fs.existsSync(lockfilePath)) {
  const lockfile = readJson(lockfilePath);
  const packages = lockfile.packages;
  if (packages && typeof packages === "object") {
    const lockfilePackages = packages as Record<string, PackageJson>;
    let changed = false;
    const workspacePaths = new Set([
      "",
      ...packageFiles.map((filePath) => path.dirname(path.relative(ROOT, filePath))),
    ]);

    for (const [packagePath, json] of Object.entries(lockfilePackages)) {
      // Entries for installed registry packages record their published metadata.
      if (!workspacePaths.has(packagePath)) continue;
      if (
        packagePath === path.dirname(path.relative(ROOT, targetPackageFile)) &&
        json.version !== version
      ) {
        json.version = version;
        changed = true;
      }
      changed = updateDependencies(json, targetPackageName, version) || changed;
    }

    if (changed) {
      writeJson(lockfilePath, lockfile);
      changedFiles.push(path.relative(ROOT, lockfilePath));
    }
  }
}

console.log(`Updated ${targetPackageName} to ${version}.`);
console.log(`Changed: ${changedFiles.join(", ")}`);
