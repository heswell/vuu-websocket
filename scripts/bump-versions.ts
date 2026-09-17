import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PUBLISHABLE_PACKAGE_NAME,
  getPublishablePackage,
  type PublishablePackageName,
} from "./publishable-packages";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES_ROOT = path.join(ROOT, "packages");
const VERSION_PATTERN =
  /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta)\.(\d+))?$/;
const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

type PackageJson = {
  name?: string;
  version?: string;
  [key: string]: unknown;
};

const printHelp = () => {
  console.log(`Usage: npm run bump:versions -- [options]

Updates @heswell/user-admin by default, or the package selected with
--package. Workspace dependencies on the selected package are also updated.

Without --version, increments the patch version. For alpha or beta releases,
the prerelease number is incremented instead.

Options:
  --package=<name>  Select @heswell/user-admin or @heswell/module-admin.
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

const findPackageJsonFiles = (directory: string): string[] =>
  fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(directory, entry.name, "package.json"))
    .filter((filePath) => fs.existsSync(filePath))
    .sort();

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

  let packageName: PublishablePackageName = DEFAULT_PUBLISHABLE_PACKAGE_NAME;
  let version: string | undefined;
  for (const argument of args) {
    if (argument.startsWith("--package=")) {
      const requestedPackage = argument.slice("--package=".length);
      const selectedPackage = getPublishablePackage(requestedPackage);
      if (!selectedPackage) {
        throw new Error(
          `Unsupported package "${requestedPackage}". Use @heswell/user-admin or @heswell/module-admin.`,
        );
      }
      packageName = selectedPackage.name;
      continue;
    }
    if (argument.startsWith("--version=")) {
      version = argument.slice("--version=".length);
      if (!version) throw new Error("The --version option requires a value.");
      continue;
    }
    throw new Error(
      `Unknown argument "${argument}". Use --package=<name>, --version=<version>, or --help.`,
    );
  }

  return { packageName, version };
};

const updateDependencies = (
  json: PackageJson,
  packageName: PublishablePackageName,
  version: string,
) => {
  let changed = false;

  for (const section of DEPENDENCY_SECTIONS) {
    const dependencies = json[section];
    if (!dependencies || typeof dependencies !== "object") continue;

    const dependencyVersions = dependencies as Record<string, unknown>;
    if (
      dependencyVersions[packageName] !== undefined &&
      dependencyVersions[packageName] !== version
    ) {
      dependencyVersions[packageName] = version;
      changed = true;
    }
  }

  return changed;
};

const packageFiles = findPackageJsonFiles(PACKAGES_ROOT);
const { packageName: targetPackageName, version: requestedVersion } = getOptions();
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
for (const filePath of packageFiles) {
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

    for (const [packagePath, json] of Object.entries(lockfilePackages)) {
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
