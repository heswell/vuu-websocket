import { nextDependencyRange } from "./publishable-packages";

export type BumpType = "major" | "minor" | "patch";

type DependencyMap = Record<string, string>;

export type Manifest = {
  name: string;
  version: string;
  dependencies?: DependencyMap;
  peerDependencies?: DependencyMap;
  [key: string]: unknown;
};

export type ReleaseCandidate = {
  name: string;
  /** Source package.json as it stands in the workspace. */
  local: Manifest;
  /** The npm manifest for local.version, or undefined if that version is not on npm. */
  published: Manifest | undefined;
};

export type ReleaseStep = {
  name: string;
  currentVersion: string;
  nextVersion: string;
  action: "bump-and-publish" | "publish" | "skip";
  reasons: string[];
};

// Sections that reach consumers. devDependencies only affect our own build.
const PUBLISHED_SECTIONS = ["dependencies", "peerDependencies"] as const;

const VUU_UI_SCOPE = "@vuu-ui/";

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.(\d+))?$/;

// Mirrors bump-versions.ts: a prerelease only moves its prerelease number.
export const incrementVersion = (version: string, bump: BumpType) => {
  const match = VERSION_PATTERN.exec(version);
  if (!match) throw new Error(`Cannot bump unsupported version "${version}".`);
  const [major, minor, patch] = [1, 2, 3].map((index) => Number(match[index]));
  if (match[4]) return `${major}.${minor}.${patch}-${match[4]}.${Number(match[5]) + 1}`;
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

/** @vuu-ui ranges in a manifest that do not admit the target version. */
export const incompatibleVuuUiRanges = (manifest: Manifest, vuuUiVersion: string) =>
  PUBLISHED_SECTIONS.flatMap((section) =>
    Object.entries(manifest[section] ?? {})
      .filter(
        ([dependency, range]) =>
          dependency.startsWith(VUU_UI_SCOPE) &&
          !Bun.semver.satisfies(vuuUiVersion, range),
      )
      .map(([dependency, range]) => `${dependency}@${range}`),
  );

/**
 * Decides, in publish order, which packages need a new version. A package is
 * released when its published @vuu-ui ranges reject the target version, or
 * when a sibling it depends on is released and its range for that sibling
 * would change (the same rule bump-versions.ts applies when it rewrites
 * dependents). A local version that is not on npm yet is published as is, so
 * the script can be re-run after a partial failure without bumping twice.
 */
export const planRelease = (
  candidates: ReleaseCandidate[],
  vuuUiVersion: string,
  bump: BumpType,
): ReleaseStep[] => {
  const releasing = new Map<string, string>();

  return candidates.map(({ name, local, published }) => {
    const stale = incompatibleVuuUiRanges(local, vuuUiVersion);
    if (stale.length > 0) {
      throw new Error(
        `${name} package.json still requires ${stale.join(", ")}, which does not admit ${vuuUiVersion}. Update its @vuu-ui ranges first.`,
      );
    }

    if (!published) {
      releasing.set(name, local.version);
      return {
        name,
        currentVersion: local.version,
        nextVersion: local.version,
        action: "publish",
        reasons: [`${local.version} is not on npm yet`],
      };
    }

    const reasons = incompatibleVuuUiRanges(published, vuuUiVersion).map(
      (range) => `published peer ${range}`,
    );
    for (const [sibling, version] of releasing) {
      for (const section of PUBLISHED_SECTIONS) {
        const range = published[section]?.[sibling];
        if (range && nextDependencyRange(range, version, section) !== range) {
          reasons.push(`${sibling} ${range} -> ${version}`);
        }
      }
    }

    if (reasons.length === 0) {
      return {
        name,
        currentVersion: local.version,
        nextVersion: local.version,
        action: "skip",
        reasons: ["published version is compatible"],
      };
    }

    const nextVersion = incrementVersion(local.version, bump);
    releasing.set(name, nextVersion);
    return {
      name,
      currentVersion: local.version,
      nextVersion,
      action: "bump-and-publish",
      reasons,
    };
  });
};

/** The npm dist-tag a version must be published under. */
export const distTagFor = (version: string) =>
  VERSION_PATTERN.exec(version)?.[4] ?? "latest";
