/**
 * Re-release the published @heswell packages after a @vuu-ui upgrade.
 *
 * First update the @vuu-ui versions in the workspace package.json files and
 * run bun install. Then:
 *   npm run release:vuu-ui -- --dry-run        # show the plan only
 *   npm run release:vuu-ui                     # bump, build, publish
 *   npm run release:vuu-ui -- --bump=major
 *
 * The script compares each package's published npm manifest with the target
 * @vuu-ui version and bumps, in dependency order, every package whose
 * published @vuu-ui ranges reject it, plus every package that depends on a
 * bumped sibling. Dependent ranges across the workspace are rewritten with the
 * same rules as bump-versions.ts. If a publish fails, fix it and run the
 * script again: versions already bumped but not on npm are published without
 * a second bump.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLISHABLE_PACKAGES, updateDependencies } from "./publishable-packages";
import {
  distTagFor,
  planRelease,
  type BumpType,
  type Manifest,
  type ReleaseCandidate,
} from "./vuu-ui-release-plan";
import { distDirectory, getWorkspacePackages } from "./workspace-packages";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = "https://registry.npmjs.org";
const BUMP_TYPES: BumpType[] = ["major", "minor", "patch"];

type Options = {
  bump: BumpType;
  vuuUiVersion?: string;
  dryRun: boolean;
  skipPublish: boolean;
  yes: boolean;
};

const printHelp = () => {
  console.log(`Usage: npm run release:vuu-ui -- [options]

Bumps and publishes, in dependency order, the @heswell packages whose
published versions do not accept the workspace's @vuu-ui version.

Options:
  --bump <major|minor|patch>  Version increment for released packages (default: minor).
                              Packages on a prerelease only move their prerelease number.
  --vuu-ui-version <version>  Target @vuu-ui version (default: the root package.json's
                              @vuu-ui/vuu-utils version).
  --dry-run                   Print the plan and change nothing.
  --skip-publish              Bump versions and update bun.lock, but do not build or publish.
  --yes                       Do not ask for confirmation.
  --help                      Print this help message.`);
};

const parseOptions = (): Options => {
  const options: Options = { bump: "minor", dryRun: false, skipPublish: false, yes: false };
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    const flag = argument.split("=")[0];
    if (argument === "--help") {
      printHelp();
      process.exit(0);
    } else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--skip-publish") options.skipPublish = true;
    else if (argument === "--yes") options.yes = true;
    else if (flag === "--bump" || flag === "--vuu-ui-version") {
      const value = argument.includes("=") ? argument.slice(flag.length + 1) : args[++index];
      if (!value || value.startsWith("--")) {
        throw new Error(`The ${flag} option requires a value.`);
      }
      if (flag === "--bump") {
        if (!BUMP_TYPES.includes(value as BumpType)) {
          throw new Error(`Unsupported bump "${value}". Use ${BUMP_TYPES.join(", ")}.`);
        }
        options.bump = value as BumpType;
      } else {
        options.vuuUiVersion = value;
      }
    } else {
      throw new Error(`Unknown argument "${argument}". Use --help for usage.`);
    }
  }
  return options;
};

const readJson = <T = Manifest>(filePath: string): T =>
  JSON.parse(fs.readFileSync(filePath, "utf8")) as T;

const writeJson = (filePath: string, json: unknown) =>
  fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);

const run = (command: string[]) => {
  console.log(`> ${command.join(" ")}`);
  const result = Bun.spawnSync(command, { cwd: ROOT, stdout: "inherit", stderr: "inherit" });
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed with exit code ${result.exitCode}.`);
  }
};

const getTargetVuuUiVersion = (requested?: string) => {
  if (requested) return requested;
  const root = readJson(path.join(ROOT, "package.json"));
  const range = root.dependencies?.["@vuu-ui/vuu-utils"];
  const version = range?.replace(/^[\^~]/, "");
  if (!version || !Bun.semver.satisfies(version, range!)) {
    throw new Error(
      "Cannot read the @vuu-ui version from the root package.json. Pass --vuu-ui-version.",
    );
  }
  return version;
};

const fetchPublishedManifest = async (name: string, version: string) => {
  const response = await fetch(`${REGISTRY}/${encodeURIComponent(name)}`);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`npm registry returned ${response.status} for ${name}.`);
  const metadata = (await response.json()) as { versions?: Record<string, Manifest> };
  return metadata.versions?.[version];
};

// The publish list must be in dependency order for planRelease to cascade.
const assertPublishOrder = () => {
  const names = PUBLISHABLE_PACKAGES.map(({ name }) => name as string);
  PUBLISHABLE_PACKAGES.forEach(({ name, directory }, index) => {
    const manifest = readJson(path.join(ROOT, directory, "package.json"));
    for (const section of ["dependencies", "peerDependencies"] as const) {
      for (const dependency of Object.keys(manifest[section] ?? {})) {
        if (names.indexOf(dependency) > index) {
          throw new Error(
            `${name} depends on ${dependency}, which comes later in PUBLISHABLE_PACKAGES.`,
          );
        }
      }
    }
  });
};

const confirm = (question: string) => {
  const answer = prompt(`${question} [y/N]`);
  return answer?.trim().toLowerCase() === "y";
};

const options = parseOptions();
const vuuUiVersion = getTargetVuuUiVersion(options.vuuUiVersion);
assertPublishOrder();

const candidates: ReleaseCandidate[] = await Promise.all(
  PUBLISHABLE_PACKAGES.map(async ({ name, directory }) => {
    const local = readJson(path.join(ROOT, directory, "package.json"));
    return { name, local, published: await fetchPublishedManifest(name, local.version) };
  }),
);
const plan = planRelease(candidates, vuuUiVersion, options.bump);

console.log(`Target @vuu-ui version: ${vuuUiVersion}\n`);
console.table(
  plan.map(({ name, currentVersion, nextVersion, action, reasons }) => ({
    package: name,
    current: currentVersion,
    next: action === "skip" ? "-" : nextVersion,
    "npm tag": action === "skip" ? "-" : distTagFor(nextVersion),
    action,
    reason: reasons.join("; "),
  })),
);

const releases = plan.filter(({ action }) => action !== "skip");
if (releases.length === 0) {
  console.log("Nothing to release.");
  process.exit(0);
}
if (options.dryRun) {
  console.log("Dry run: no files changed, nothing published.");
  process.exit(0);
}

if (!options.skipPublish) {
  const whoami = Bun.spawnSync(["npm", "whoami", "--registry", REGISTRY], { cwd: ROOT });
  if (whoami.exitCode !== 0) throw new Error("Not logged in to npm. Run npm login first.");
  console.log(`Publishing as ${whoami.stdout.toString().trim()}.`);
}
if (!options.yes && !confirm(options.skipPublish ? "Apply these bumps?" : "Bump and publish?")) {
  console.log("Cancelled.");
  process.exit(1);
}

// 1. Bump versions and rewrite every workspace reference to them.
const manifestPaths = [
  path.join(ROOT, "package.json"),
  ...getWorkspacePackages().map(({ directory }) =>
    path.join(ROOT, directory, "package.json"),
  ),
];
const bumps = releases.filter(({ action }) => action === "bump-and-publish");
if (bumps.length > 0) {
  const manifests = new Map(manifestPaths.map((filePath) => [filePath, readJson(filePath)]));
  const changed = new Set<string>();
  for (const { name, nextVersion } of bumps) {
    for (const [filePath, manifest] of manifests) {
      if (manifest.name === name) {
        manifest.version = nextVersion;
        changed.add(filePath);
      }
      if (updateDependencies(manifest, name, nextVersion)) changed.add(filePath);
    }
  }
  for (const filePath of changed) writeJson(filePath, manifests.get(filePath));
  console.log(`Updated: ${[...changed].map((p) => path.relative(ROOT, p)).join(", ")}`);
  run(["bun", "install"]);
}

if (options.skipPublish) {
  console.log("Skipped publish. Run npm run release:vuu-ui again to publish.");
  process.exit(0);
}

// 2. Build everything once, then publish in dependency order.
run(["npm", "run", "build:packages"]);
const published: string[] = [];
try {
  for (const { name, nextVersion } of releases) {
    const { directory } = PUBLISHABLE_PACKAGES.find((p) => p.name === name)!;
    const distPath = `./${distDirectory(directory)}`;
    const dist = readJson(path.join(ROOT, distPath, "package.json"));
    if (dist.version !== nextVersion) {
      throw new Error(`${distPath} is at ${dist.version}, expected ${nextVersion}.`);
    }
    run([
      "npm",
      "publish",
      distPath,
      "--registry",
      REGISTRY,
      "--access",
      "public",
      "--tag",
      distTagFor(nextVersion),
    ]);
    published.push(`${name}@${nextVersion}`);
  }
} catch (error) {
  console.error(
    `\n${releases.length - published.length} package(s) not published. Fix the error and run the script again; bumped versions will not be bumped twice.`,
  );
  throw error;
} finally {
  if (published.length > 0) console.log(`\nPublished: ${published.join(", ")}`);
}
