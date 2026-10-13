import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  nextDependencyRange,
  PUBLISHABLE_PACKAGES,
} from "../publishable-packages";

const PACKAGES_ROOT = path.resolve(import.meta.dir, "../../packages");
const SECTIONS = ["dependencies", "peerDependencies"] as const;

type Manifest = { version?: string } & Partial<
  Record<(typeof SECTIONS)[number] | "devDependencies", Record<string, string>>
>;

const readManifest = (directory: string): Manifest =>
  JSON.parse(
    fs.readFileSync(path.join(PACKAGES_ROOT, directory, "package.json"), "utf8"),
  );

describe("publishable package manifests", () => {
  for (const { name, directory } of PUBLISHABLE_PACKAGES) {
    test(`${name} uses caret ranges for sibling @heswell packages`, () => {
      const manifest = readManifest(directory);
      for (const section of SECTIONS) {
        for (const [dependency, range] of Object.entries(
          manifest[section] ?? {},
        )) {
          if (dependency.startsWith("@heswell/")) {
            for (const alternative of range.split("||")) {
              expect(`${dependency}@${alternative.trim()}`).toMatch(
                /@\^\d+\.\d+\.\d+$/,
              );
            }
          }
        }
      }
    });
  }

  test("vuu-portal shares the consumer's vuu-server and vuu-table", () => {
    const manifest = readManifest("vuu-portal");
    for (const dependency of ["@heswell/vuu-server", "@heswell/vuu-table"]) {
      expect(manifest.dependencies?.[dependency]).toBeUndefined();
      const peerRange = manifest.peerDependencies?.[dependency];
      const devRange = manifest.devDependencies?.[dependency];
      expect(peerRange).toBeDefined();
      expect(devRange).toBeDefined();
      // The workspace copy used for local builds must satisfy both ranges.
      const { version } = readManifest(
        dependency.replace("@heswell/", ""),
      ) as { version: string };
      expect(Bun.semver.satisfies(version, peerRange!)).toBe(true);
      expect(Bun.semver.satisfies(version, devRange!)).toBe(true);
    }
  });
});

describe("nextDependencyRange", () => {
  test("keeps the range operator", () => {
    expect(nextDependencyRange("^1.0.1", "1.0.2", "dependencies")).toBe("^1.0.2");
    expect(nextDependencyRange("~1.0.1", "1.0.2", "dependencies")).toBe("~1.0.2");
    expect(nextDependencyRange("1.0.1", "1.0.2", "dependencies")).toBe("1.0.2");
  });

  test("handles compound peer ranges", () => {
    const range = "^3.1.0 || ^4.0.0";
    expect(nextDependencyRange(range, "3.3.0", "peerDependencies")).toBe(range);
    expect(nextDependencyRange(range, "4.0.0", "peerDependencies")).toBe(range);
    expect(nextDependencyRange(range, "5.0.0", "peerDependencies")).toBe(
      "^5.0.0",
    );
    expect(nextDependencyRange(range, "4.0.1", "devDependencies")).toBe(
      "^4.0.1",
    );
  });

  test("leaves a peer range that admits the new version", () => {
    expect(nextDependencyRange("^3.1.0", "3.4.0", "peerDependencies")).toBe(
      "^3.1.0",
    );
    expect(nextDependencyRange("^3.1.0", "4.0.0", "peerDependencies")).toBe(
      "^4.0.0",
    );
  });
});
