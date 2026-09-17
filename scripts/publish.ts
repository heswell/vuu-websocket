/**
 * Publish @heswell/user-admin:
 *   npm run pub
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = "https://registry.npmjs.org";
const PACKAGE_NAME = "@heswell/user-admin";
const PACKAGE_DIRECTORY = "dist/user-admin";
const PACKAGE_JSON_PATH = path.join(ROOT, PACKAGE_DIRECTORY, "package.json");
const SOURCE_PACKAGE_JSON_PATH = path.join(
  ROOT,
  "packages/user-admin/package.json",
);
const PUBLISH_VERIFICATION_DELAY_MS = 10_000;

type PackageManifest = {
  name: string;
  version: string;
};

type NpmMetadata = {
  versions?: Record<string, unknown>;
  "dist-tags"?: Record<string, string>;
};

type Options = {
  dryRun: boolean;
  publishTag?: string;
  versionCheck: boolean;
};

const printHelp = () => {
  console.log(`Usage: npm run pub -- [options]

Builds and publishes ${PACKAGE_NAME} from dist/user-admin.

Options:
  --tag <alpha|beta>  Publish under an npm prerelease dist-tag.
  --dry-run           Validate the npm package without publishing it.
  --version-check     Show the version and current npm dist-tags.
  --help              Print this help message.`);
};

const readManifest = (): PackageManifest => {
  const sourceManifest = JSON.parse(
    fs.readFileSync(SOURCE_PACKAGE_JSON_PATH, "utf8"),
  ) as Partial<PackageManifest>;

  if (sourceManifest.name !== PACKAGE_NAME || !sourceManifest.version) {
    throw new Error("Invalid source package manifest at packages/user-admin.");
  }

  return sourceManifest as PackageManifest;
};

const assertBuiltPackageMatchesSource = (sourceManifest: PackageManifest) => {
  if (!fs.existsSync(PACKAGE_JSON_PATH)) {
    throw new Error(
      `Build output is missing at ${PACKAGE_DIRECTORY}. Run npm run build:packages.`,
    );
  }

  const builtManifest = JSON.parse(
    fs.readFileSync(PACKAGE_JSON_PATH, "utf8"),
  ) as Partial<PackageManifest>;
  if (
    builtManifest.name !== sourceManifest.name ||
    builtManifest.version !== sourceManifest.version
  ) {
    throw new Error(
      `Build output is stale at ${PACKAGE_DIRECTORY}. Run npm run build:packages.`,
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

const checkPackageVersion = async () => {
  const { name, version } = readManifest();
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

const options = parseOptions();
const sourceManifest = readManifest();

if (options.versionCheck) {
  console.table([await checkPackageVersion()]);
} else {
  runNpm(["run", "build:packages"]);
  assertBuiltPackageMatchesSource(sourceManifest);
  runNpm(["pack", "--dry-run", `./${PACKAGE_DIRECTORY}`]);

  const publishArgs = [
    "publish",
    `./${PACKAGE_DIRECTORY}`,
    "--registry",
    REGISTRY,
    "--access",
    "public",
  ];
  if (options.publishTag) publishArgs.push("--tag", options.publishTag);
  if (options.dryRun) publishArgs.push("--dry-run");
  runNpm(publishArgs);

  if (!options.dryRun) {
    await new Promise((resolve) =>
      setTimeout(resolve, PUBLISH_VERIFICATION_DELAY_MS),
    );
    console.table([await checkPackageVersion()]);
  }
}
