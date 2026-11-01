import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { loadModuleState } from "../src/modules/ModuleDiscovery/ModuleDiscoveryModule";
import { loadDefaultModules } from "../src/modules/ModuleDiscovery/ModuleStore";
import { DEFAULT_MODULES_FILE } from "./defaultModules";

const root = path.join(import.meta.dir, ".test-output", "default-modules");

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("portal default modules", () => {
  test("loads the shipped default-modules.yaml with access roles", () => {
    const modules = loadDefaultModules(DEFAULT_MODULES_FILE, 123);

    expect(modules.map(({ name, accessRole }) => [name, accessRole])).toEqual([
      ["moduleAdmin", "module-admin-access"],
      ["userAdmin", "user-admin-access"],
      ["basket-trading", "basket-trading-access"],
      ["vuu-table-browser", "vuu-table-browser-access"],
      ["vuu-table-viewer", "vuu-table-viewer-access"],
    ]);
    expect(modules[0]).toMatchObject({ id: 1, created: 123, updated: 123 });
  });

  test("seeds modules.yaml from the configured default modules file", () => {
    fs.mkdirSync(root, { recursive: true });
    const defaultsPath = writeFile(
      "defaults.yaml",
      `modules:
  - id: 1
    version: 2
    parentModuleId: 0
    name: alpha
    title: Alpha
    description: ""
    enabled: true
    location: /Tools/Alpha
    path: /alpha
    mfComponent: Alpha
    mfScope: alpha
    mfUrl: http://localhost:5100
    navIconUrl: ""
    accessRole: alpha-access
`,
    );
    const modulesPath = path.join(root, "modules.yaml");
    const config = {
      getPath: (key: string) =>
        key === "vuu.portal.defaultModulesFile" ? defaultsPath : modulesPath,
    };

    expect(loadModuleState(config).modules).toEqual([
      expect.objectContaining({ id: 1, version: 2, name: "alpha", accessRole: "alpha-access" }),
    ]);
    expect(fs.existsSync(modulesPath)).toBe(true);
  });

  test("rejects a file without a modules list", () => {
    const filePath = writeFile("defaults.yaml", "moduleAccess: {}\n");

    expect(() => loadDefaultModules(filePath, 1)).toThrow("must contain a 'modules' list");
  });

  test("rejects invalid module entries", () => {
    const filePath = writeFile("defaults.yaml", "modules:\n  - id: 1\n");

    expect(() => loadDefaultModules(filePath, 1)).toThrow("is missing 'version'");
  });
});

function writeFile(name: string, contents: string) {
  fs.mkdirSync(root, { recursive: true });
  const filePath = path.join(root, name);
  fs.writeFileSync(filePath, contents, "utf8");
  return filePath;
}
