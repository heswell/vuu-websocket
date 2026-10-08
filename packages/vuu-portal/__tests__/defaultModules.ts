import path from "node:path";
import { loadDefaultModules } from "../src/modules/ModuleDiscovery/ModuleStore";

export const DEFAULT_MODULES_FILE = path.join(
  import.meta.dir,
  "..",
  "default-modules.yaml",
);

export const defaultModules = (timestamp = Date.now()) =>
  loadDefaultModules(DEFAULT_MODULES_FILE, timestamp);

export const navIconUrl = (name: string) =>
  defaultModules().find((module) => module.name === name)?.navIconUrl;
