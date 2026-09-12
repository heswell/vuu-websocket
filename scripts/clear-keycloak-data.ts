#!/usr/bin/env bun

/**
 * Remove only the local embedded H2 files used by Keycloak development.
 *
 * Stop Keycloak before running this script. Removing an open H2 database can
 * leave a partial database or produce misleading startup errors.
 *
 * The default location matches a local Keycloak distribution rooted at
 * ./keycloak. Set KEYCLOAK_HOME, KEYCLOAK_DATA_DIR, or KEYCLOAK_H2_DIR when
 * the distribution uses another location.
 */

import { readdir, unlink } from "node:fs/promises";
import path from "node:path";

const keycloakDataDirectory =
  process.env.KEYCLOAK_DATA_DIR ??
  path.join(process.env.KEYCLOAK_HOME ?? "keycloak", "data");
const h2Directory = path.resolve(
  process.env.KEYCLOAK_H2_DIR ?? path.join(keycloakDataDirectory, "h2"),
);
const h2FilePattern =
  /^keycloak(?:db)?\.(?:mv|trace|lock|data)\.db$/;

console.log(
  `[keycloak] clearing local H2 files from ${h2Directory}; Keycloak must be stopped`,
);

let removed = 0;
let entries: string[];
try {
  entries = await readdir(h2Directory);
} catch (error) {
  if (isMissingPath(error)) {
    console.log("[keycloak] H2 data directory is absent; nothing to clear");
    process.exit(0);
  }
  throw error;
}

for (const entry of entries) {
  if (!h2FilePattern.test(entry)) {
    continue;
  }
  await unlink(path.join(h2Directory, entry));
  removed += 1;
  console.log(`[keycloak] removed ${entry}`);
}

console.log(`[keycloak] removed ${removed} H2 data file${removed === 1 ? "" : "s"}`);

function isMissingPath(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
