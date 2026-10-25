/**
 * Check all workspace versions without building or publishing:
 *   npm run version-check
 *   npm run version-check -- --package=@heswell/module-admin
 *
 * Columns: package, src (package.json), dist (dist/package.json), npm alpha,
 * npm beta, npm latest. An asterisk marks an older or unavailable npm tag
 * in the dist version's release channel.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getWorkspacePackages, readManifest } from "./workspace-packages";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = "https://registry.npmjs.org";

type NpmMetadata = {
  "dist-tags"?: Record<string, string>;
};

const parseOptions = () => {
  let packageName: string | undefined;
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--help") {
      console.log(`Usage: npm run version-check -- [options]

Shows source/dist versions and npm dist-tags for all workspace packages.
Does not build or publish.

Options:
  --package <name>  Select any workspace package by its package.json name.
  --help            Print this help message.

Columns: package, src (package.json), dist (dist/package.json),
npm alpha, npm beta, npm latest.
* marks an older or unavailable npm tag in the dist version's release channel.`);
      process.exit(0);
    }
    if (argument === "--package" || argument.startsWith("--package=")) {
      const value = argument.startsWith("--package=")
        ? argument.slice("--package=".length)
        : args[++index];
      if (!value || value.startsWith("--")) {
        throw new Error("The --package option requires a value.");
      }
      packageName = value;
      continue;
    }
    throw new Error(`Unknown argument "${argument}". Use --help for usage.`);
  }
  return { packageName };
};

const checkPackageVersion = async (packageName: string, directory: string) => {
  const { name, version } = readManifest(
    packageName,
    path.join(ROOT, "packages", directory, "package.json"),
  );
  const distManifestPath = path.join(ROOT, "dist", directory, "package.json");
  const distVersion = fs.existsSync(distManifestPath)
    ? readManifest(packageName, distManifestPath).version
    : "-";
  const response = await fetch(`${REGISTRY}/${encodeURIComponent(name)}`);
  if (!response.ok && response.status !== 404) {
    throw new Error(`npm registry returned ${response.status} for ${name}.`);
  }

  const metadata: NpmMetadata =
    response.status === 404 ? {} : await response.json();
  return {
    package: name,
    src: version,
    dist: distVersion,
    "npm alpha": metadata["dist-tags"]?.alpha ?? "-",
    "npm beta": metadata["dist-tags"]?.beta ?? "-",
    "npm latest": metadata["dist-tags"]?.latest ?? "-",
  };
};

const { packageName } = parseOptions();
const packages = getWorkspacePackages();
if (packageName && !packages.some(({ name }) => name === packageName)) {
  throw new Error(`Unknown workspace package "${packageName}".`);
}
const selectedPackages = packages.filter(
  ({ name }) => !packageName || name === packageName,
);
const results = await Promise.allSettled(
  selectedPackages.map(({ name, directory }) =>
    checkPackageVersion(name, directory),
  ),
);
const failures = results.filter(({ status }) => status === "rejected");
let hasUnpublishedVersions = false;
console.table(
  results.map((result, index) => {
    if (result.status === "rejected") {
      return {
        package: selectedPackages[index].name,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      };
    }
    const row = result.value;
    if (row.dist !== "-") {
      const prerelease = row.dist.split("+")[0].split("-")[1];
      const channel = prerelease ? prerelease.split(".")[0] : "latest";
      const column = !prerelease
        ? "npm latest"
        : channel === "alpha" || channel === "beta"
          ? (`npm ${channel}` as const)
          : undefined;
      if (
        column &&
        (row[column] === "-" ||
          Bun.semver.order(row[column], row.dist) < 0)
      ) {
        row[column] += " *";
        hasUnpublishedVersions = true;
      }
    }
    return row;
  }),
  [
    "package",
    "src",
    "dist",
    "npm alpha",
    "npm beta",
    "npm latest",
    ...(failures.length ? ["error"] : []),
  ],
);
if (hasUnpublishedVersions) {
  console.log(
    "* npm tag is older than dist or unavailable in the dist release channel.",
  );
}
if (failures.length) {
  throw new Error(`${failures.length} version check(s) failed.`);
}
