/**
 * Publish a package:
 *   npm run pub
 *   npm run pub -- --package=@heswell/module-admin
 *
 * Validate without publishing:
 *   npm run pub -- --dry-run
 *
 * Check versions separately:
 *   npm run version-check
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PUBLISHABLE_PACKAGE_NAME,
  getPublishablePackage,
  PUBLISHABLE_PACKAGE_NAMES_TEXT,
} from "./publishable-packages";
import { readManifest, type PackageManifest } from "./workspace-packages";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = "https://registry.npmjs.org";

type Options = {
  dryRun: boolean;
  packageName?: string;
  publishTag?: string;
};

const printHelp = () => {
  console.log(`Usage: npm run pub -- [options]

Builds and publishes ${DEFAULT_PUBLISHABLE_PACKAGE_NAME} by default.

Options:
  --package <name>   Publish one of: ${PUBLISHABLE_PACKAGE_NAMES_TEXT}.
  --tag <alpha|beta>  Publish under an npm prerelease dist-tag.
  --dry-run           Validate the npm package without publishing it.
  --help              Print this help message.

Check versions separately with npm run version-check.`);
};

const getPackage = (packageName: string) => {
  const selectedPackage = getPublishablePackage(packageName);
  if (!selectedPackage) {
    throw new Error(`Unsupported package "${packageName}".`);
  }
  const { directory } = selectedPackage;
  return {
    directory: `dist/${directory}`,
    sourceManifestPath: path.join(ROOT, "packages", directory, "package.json"),
  };
};

const assertBuiltPackageMatchesSource = (
  sourceManifest: PackageManifest,
  packageDirectory: string,
) => {
  const packageJsonPath = path.join(ROOT, packageDirectory, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(
      `Build output is missing at ${packageDirectory}. Run npm run build:packages.`,
    );
  }

  const builtManifest = JSON.parse(
    fs.readFileSync(packageJsonPath, "utf8"),
  ) as Partial<PackageManifest>;
  if (
    builtManifest.name !== sourceManifest.name ||
    builtManifest.version !== sourceManifest.version
  ) {
    throw new Error(
      `Build output is stale at ${packageDirectory}. Run npm run build:packages.`,
    );
  }
};

const getOptionValue = (args: string[], index: number, flag: string) => {
  const inlineValue = args[index].slice(`${flag}=`.length);
  if (args[index].startsWith(`${flag}=`)) {
    if (!inlineValue) throw new Error(`The ${flag} option requires a value.`);
    return { nextIndex: index, value: inlineValue };
  }

  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`The ${flag} option requires a value.`);
  }
  return { nextIndex: index + 1, value };
};

const parseOptions = (): Options => {
  const options: Options = {
    dryRun: false,
  };
  const args = process.argv.slice(2);

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--help") {
      printHelp();
      process.exit(0);
    }
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (argument === "--package" || argument.startsWith("--package=")) {
      const { nextIndex, value } = getOptionValue(args, index, "--package");
      options.packageName = value;
      index = nextIndex;
      continue;
    }
    if (argument === "--tag" || argument.startsWith("--tag=")) {
      const { nextIndex, value } = getOptionValue(args, index, "--tag");
      options.publishTag = value;
      index = nextIndex;
      continue;
    }
    throw new Error(`Unknown argument "${argument}". Use --help for usage.`);
  }

  if (options.publishTag && !["alpha", "beta"].includes(options.publishTag)) {
    throw new Error(
      `Unsupported publish tag "${options.publishTag}". Use alpha or beta.`,
    );
  }

  return options;
};

const runNpm = (args: string[]) => {
  console.log(`> npm ${args.join(" ")}`);
  const result = Bun.spawnSync(["npm", ...args], {
    cwd: ROOT,
    stderr: "inherit",
    stdout: "inherit",
  });

  if (result.exitCode !== 0) {
    throw new Error(`npm ${args[0]} failed with exit code ${result.exitCode}.`);
  }
};

const reportPublishSuccess = (packageName: string) => {
  console.table([
    {
      message: "publish succeeded",
      package: packageName,
      status: "SUCCESS",
    },
  ]);
};

const options = parseOptions();

const packageName = options.packageName ?? DEFAULT_PUBLISHABLE_PACKAGE_NAME;
const { directory: packageDirectory, sourceManifestPath } =
  getPackage(packageName);
const sourceManifest = readManifest(packageName, sourceManifestPath);
runNpm(["run", "build:packages"]);
assertBuiltPackageMatchesSource(sourceManifest, packageDirectory);
runNpm(["pack", "--dry-run", `./${packageDirectory}`]);

const publishArgs = [
  "publish",
  `./${packageDirectory}`,
  "--registry",
  REGISTRY,
  "--access",
  "public",
];
if (options.publishTag) publishArgs.push("--tag", options.publishTag);
if (options.dryRun) publishArgs.push("--dry-run");
runNpm(publishArgs);

if (!options.dryRun) {
  reportPublishSuccess(packageName);
}
