import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_MODULE_DEFINITIONS, toManagedModules } from "@heswell/module-admin";
import { YamlModuleStore } from "../src/modules/ModuleDiscovery/ModuleStore";

const root = path.join(import.meta.dir, ".test-output", "module-store");

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("YamlModuleStore", () => {
  test("seeds and writes modules.yaml when missing", () => {
    const filePath = path.join(root, "modules.yaml");
    const store = new YamlModuleStore(filePath, () => seeded(100));

    expect(store.load()).toEqual(seeded(100));
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test("round-trips saved modules with atomic temp cleanup", () => {
    const filePath = path.join(root, "modules.yaml");
    const store = new YamlModuleStore(filePath, () => seeded(100));
    store.save(seeded(200));

    expect(store.load()).toEqual(seeded(200));
    expect(fs.readdirSync(root).filter((name) => name.includes(".tmp"))).toEqual([]);
  });

  test("fails fast on malformed files", () => {
    fs.mkdirSync(root, { recursive: true });
    const filePath = path.join(root, "modules.yaml");
    fs.writeFileSync(filePath, "modules:\n  - id: nope\n", "utf8");

    expect(() => new YamlModuleStore(filePath, () => []).load()).toThrow("field 'id' must be a number");
  });

  test("ignores retired VUU connection fields in existing files", () => {
    fs.mkdirSync(root, { recursive: true });
    const filePath = path.join(root, "modules.yaml");
    const legacy = seeded(100).map((module) => ({
      ...module,
      vuuConnectionId: "legacy",
      vuuWebsocketUrl: "wss://localhost:1/legacy",
      vuuRestUrl: "https://localhost:1/legacy",
    }));
    fs.writeFileSync(filePath, Bun.YAML.stringify({ modules: legacy }), "utf8");

    expect(new YamlModuleStore(filePath, () => []).load()).toEqual(seeded(100));
  });
});

function seeded(timestamp: number) {
  return toManagedModules(
    DEFAULT_MODULE_DEFINITIONS,
    [
      { moduleName: "moduleAdmin", role: "module-admin-access" },
      { moduleName: "userAdmin", role: "user-admin-access" },
      { moduleName: "basket-trading", role: "basket-trading-access" },
      { moduleName: "vuu-table-browser", role: "vuu-table-browser-access" },
      { moduleName: "vuu-table-viewer", role: "vuu-table-viewer-access" },
    ],
    timestamp,
  );
}
