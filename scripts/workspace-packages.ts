import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Top-level folders that hold workspace packages, by role.
export const WORKSPACE_FOLDERS = [
  "packages", // engine and server libraries
  "vuu-modules", // Vuu modules that hosts plug in
  "services", // standalone data services
  "apps", // Vuu servers you start
  "tools", // dev-only tooling
] as const;

// Build output is flat: <group>/<name> builds to dist/<name>.
export const distDirectory = (directory: string) =>
  path.posix.join("dist", ...directory.split("/").slice(1));

export type PackageManifest = {
  name: string;
  version: string;
};

export const readManifest = (
  packageName: string,
  manifestPath: string,
): PackageManifest => {
  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, "utf8"),
  ) as Partial<PackageManifest>;

  if (manifest.name !== packageName || !manifest.version) {
    throw new Error(`Invalid package manifest at ${manifestPath}.`);
  }

  return manifest as PackageManifest;
};

/** Every workspace package, with its directory relative to the repo root. */
export const getWorkspacePackages = () => {
  const packages: { name: string; directory: string }[] = [];

  const visit = (directory: string) => {
    const manifestPath = path.join(directory, "package.json");
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (typeof manifest.name !== "string" || !manifest.name) {
        throw new Error(`Missing package name at ${manifestPath}.`);
      }
      packages.push({
        name: manifest.name,
        directory: path.relative(ROOT, directory).split(path.sep).join("/"),
      });
    }
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        entry.name !== "node_modules" &&
        entry.name !== "dist"
      ) {
        visit(path.join(directory, entry.name));
      }
    }
  };

  for (const folder of WORKSPACE_FOLDERS) {
    const folderPath = path.join(ROOT, folder);
    if (fs.existsSync(folderPath)) visit(folderPath);
  }
  return packages.sort((a, b) => a.directory.localeCompare(b.directory));
};
