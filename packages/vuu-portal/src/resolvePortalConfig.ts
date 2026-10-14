import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ConfigValue } from "@heswell/vuu-server";

export type PortalConfigSource =
  "--config" | "VUU_CONFIG_FILE" | "VUU_APP" | "cwd" | "bundled";

export type ResolvedPortalConfig = {
  /** Absolute path of the application.conf to load. */
  configFile: string;
  source: PortalConfigSource;
  /**
   * Config overrides. Only set for the bundled conf: the writable module
   * catalogue (vuu.portal.modulesFile) goes in the current directory, or at
   * $VUU_PORTAL_MODULES_FILE, never inside the installed package; and
   * $VUU_CERT_PATH, $VUU_KEY_PATH and $VUU_PORTAL_DEFAULT_MODULES_FILE
   * resolve against the current directory.
   */
  overrides?: Record<string, ConfigValue>;
};

export type ResolvePortalConfigOptions = {
  configFile?: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
};

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The application.conf shipped in the package's config/ directory. Source
 * modules live in src/, the built entries at the package root.
 */
export const BUNDLED_CONFIG_FILE = [
  path.resolve(here, "../config/application.conf"),
  path.resolve(here, "config/application.conf"),
].find((candidate) => fs.existsSync(candidate)) as string;

const existingFile = (file: string, source: PortalConfigSource) => {
  if (!fs.existsSync(file)) {
    throw new Error(`Config file not found at '${file}' (from ${source})`);
  }
  return file;
};

/**
 * Locates the portal's application.conf: --config, then $VUU_CONFIG_FILE,
 * then $VUU_APP (packages/<app>/application.conf), then ./application.conf,
 * then the conf bundled with the package.
 */
export function resolvePortalConfig({
  configFile,
  cwd = process.cwd(),
  env = process.env,
}: ResolvePortalConfigOptions = {}): ResolvedPortalConfig {
  if (configFile) {
    return {
      configFile: existingFile(path.resolve(cwd, configFile), "--config"),
      source: "--config",
    };
  }
  const envFile = env.VUU_CONFIG_FILE?.trim();
  if (envFile) {
    return {
      configFile: existingFile(path.resolve(cwd, envFile), "VUU_CONFIG_FILE"),
      source: "VUU_CONFIG_FILE",
    };
  }
  const appName = env.VUU_APP?.trim();
  if (appName) {
    return {
      configFile: existingFile(
        path.resolve(cwd, "packages", appName, "application.conf"),
        "VUU_APP",
      ),
      source: "VUU_APP",
    };
  }
  const cwdFile = path.resolve(cwd, "application.conf");
  if (fs.existsSync(cwdFile)) {
    return { configFile: cwdFile, source: "cwd" };
  }
  if (!BUNDLED_CONFIG_FILE) {
    throw new Error(
      "Unable to locate application.conf: pass --config, or set VUU_CONFIG_FILE or VUU_APP.",
    );
  }
  // Paths in a conf resolve against its directory. For the bundled conf that
  // is inside the installed package, so path-valued env vars, and the
  // writable module catalogue, resolve against the current directory.
  const overrides: Record<string, ConfigValue> = {
    "vuu.portal.modulesFile": path.resolve(
      cwd,
      env.VUU_PORTAL_MODULES_FILE?.trim() || "modules.yaml",
    ),
  };
  for (const [key, envName] of BUNDLED_PATH_ENV) {
    const value = env[envName]?.trim();
    if (value) overrides[key] = path.resolve(cwd, value);
  }
  return { configFile: BUNDLED_CONFIG_FILE, source: "bundled", overrides };
}

const BUNDLED_PATH_ENV = [
  ["vuu.certPath", "VUU_CERT_PATH"],
  ["vuu.keyPath", "VUU_KEY_PATH"],
  ["vuu.portal.defaultModulesFile", "VUU_PORTAL_DEFAULT_MODULES_FILE"],
] as const;
