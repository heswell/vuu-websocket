import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

export const getWorkspacePackages = () => {
  const packagesRoot = path.join(ROOT, "packages");
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
        directory: path.relative(packagesRoot, directory),
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

  visit(packagesRoot);
  return packages.sort((a, b) => a.directory.localeCompare(b.directory));
};
