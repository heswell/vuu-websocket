/**
 * Publish a package:
 *   npm run pub
 *   npm run pub -- --package=@heswell/module-admin
 *
 * Validate without publishing:
 *   npm run pub -- --dry-run
 *
 * Check the version on npm:
 *   npm run pub -- --version-check
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PUBLISHABLE_PACKAGE_NAME,
  getPublishablePackage,
  type PublishablePackageName,
} from "./publishable-packages";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = "https://registry.npmjs.org";
const PUBLISH_VERIFICATION_DELAY_MS = 10_000;

type PackageManifest = {
  name: string;
  version: string;
};

type NpmMetadata = {
  versions?: Record<string, unknown>;
  "dist-tags"?: Record<string, string>;
};

type PackageVersionCheck = {
  "npm alpha": string;
  "npm beta": string;
  "npm latest": string;
  package: string;
  "package.json": string;
  published: boolean;
};

type Options = {
  dryRun: boolean;
  packageName: PublishablePackageName;
  publishTag?: string;
  versionCheck: boolean;
};

const printHelp = () => {
  console.log(`Usage: npm run pub -- [options]

Builds and publishes ${DEFAULT_PUBLISHABLE_PACKAGE_NAME} by default.

Options:
  --package <name>   Publish @heswell/user-admin or @heswell/module-admin.
  --tag <alpha|beta>  Publish under an npm prerelease dist-tag.
  --dry-run           Validate the npm package without publishing it.
  --version-check     Show the version and current npm dist-tags.
  --help              Print this help message.`);
};

const getPackage = (packageName: PublishablePackageName) => {
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

const readManifest = (
  packageName: PublishablePackageName,
  sourceManifestPath: string,
): PackageManifest => {
  const sourceManifest = JSON.parse(
    fs.readFileSync(sourceManifestPath, "utf8"),
  ) as Partial<PackageManifest>;

  if (sourceManifest.name !== packageName || !sourceManifest.version) {
    throw new Error(`Invalid source package manifest at ${sourceManifestPath}.`);
  }

  return sourceManifest as PackageManifest;
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
    packageName: DEFAULT_PUBLISHABLE_PACKAGE_NAME,
    versionCheck: false,
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
    if (argument === "--version-check") {
      options.versionCheck = true;
      continue;
    }
    if (argument === "--package" || argument.startsWith("--package=")) {
      const { nextIndex, value } = getOptionValue(args, index, "--package");
      const selectedPackage = getPublishablePackage(value);
      if (!selectedPackage) {
        throw new Error(
          `Unsupported package "${value}". Use @heswell/user-admin or @heswell/module-admin.`,
        );
      }
      options.packageName = selectedPackage.name;
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
  if (options.versionCheck && (options.dryRun || options.publishTag)) {
    throw new Error(
      "--version-check cannot be combined with --dry-run or --tag.",
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

const checkPackageVersion = async (
  packageName: PublishablePackageName,
  sourceManifestPath: string,
): Promise<PackageVersionCheck> => {
  const { name, version } = readManifest(packageName, sourceManifestPath);
  const response = await fetch(`${REGISTRY}/${encodeURIComponent(name)}`);

  if (response.status === 404) {
    return {
      "npm alpha": "unavailable",
      "npm beta": "unavailable",
      "npm latest": "unavailable",
      package: name,
      "package.json": version,
      published: false,
    };
  }
  if (!response.ok) {
    throw new Error(`npm registry returned ${response.status} for ${name}.`);
  }

  const metadata = (await response.json()) as NpmMetadata;
  return {
    "npm alpha": metadata["dist-tags"]?.alpha ?? "unavailable",
    "npm beta": metadata["dist-tags"]?.beta ?? "unavailable",
    "npm latest": metadata["dist-tags"]?.latest ?? "unavailable",
    package: name,
    "package.json": version,
    published: Object.hasOwn(metadata.versions ?? {}, version),
  };
};

const printVersionCheck = async (
  packageName: PublishablePackageName,
  sourceManifestPath: string,
) => {
  const result = await checkPackageVersion(packageName, sourceManifestPath);
  console.table([
    {
      "npm alpha": result["npm alpha"],
      "npm beta": result["npm beta"],
      "npm latest": result["npm latest"],
      package: result.package,
      "package.json": result["package.json"],
    },
  ]);
};

const reportPublishSuccess = (packageName: PublishablePackageName) => {
  console.table([
    {
      message: "publish succeeded",
      package: packageName,
      status: "SUCCESS",
    },
  ]);
};

const options = parseOptions();
const { directory: packageDirectory, sourceManifestPath } = getPackage(
  options.packageName,
);
const sourceManifest = readManifest(options.packageName, sourceManifestPath);

if (options.versionCheck) {
  await printVersionCheck(options.packageName, sourceManifestPath);
} else {
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
    reportPublishSuccess(options.packageName);
    await new Promise((resolve) =>
      setTimeout(resolve, PUBLISH_VERIFICATION_DELAY_MS),
    );
    await printVersionCheck(options.packageName, sourceManifestPath);
  }
}
