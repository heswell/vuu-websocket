import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { YamlModuleStore } from "../src/modules/ModuleDiscovery/ModuleStore";
import { defaultModules } from "./defaultModules";

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

  test("round-trips optional nav metadata and omits it when unset", () => {
    const filePath = path.join(root, "modules.yaml");
    const store = new YamlModuleStore(filePath, () => []);
    const [first, ...rest] = seeded(100);
    const modules = [
      {
        ...first,
        navOrder: 1.5,
        navBadge: "orders.working",
        notificationTopics: ["orders", "fills"],
      },
      ...rest,
    ];
    store.save(modules);

    expect(store.load()).toEqual(modules);
    const saved = Bun.YAML.parse(fs.readFileSync(filePath, "utf8")) as {
      modules: Record<string, unknown>[];
    };
    expect(saved.modules[0].notificationTopics).toEqual(["orders", "fills"]);
    expect(saved.modules[1]).not.toContainAnyKeys([
      "navOrder",
      "navBadge",
      "notificationTopics",
    ]);
  });

  test("rejects invalid nav metadata", () => {
    fs.mkdirSync(root, { recursive: true });
    const filePath = path.join(root, "modules.yaml");
    const write = (overrides: Record<string, unknown>) =>
      fs.writeFileSync(
        filePath,
        Bun.YAML.stringify({ modules: [{ ...seeded(100)[0], ...overrides }] }),
        "utf8",
      );

    write({ navOrder: "first" });
    expect(() => new YamlModuleStore(filePath, () => []).load()).toThrow("field 'navOrder' must be a number");
    write({ notificationTopics: "orders" });
    expect(() => new YamlModuleStore(filePath, () => []).load()).toThrow("field 'notificationTopics' must be a list of strings");
    write({ notificationTopics: ["orders,fills"] });
    expect(() => new YamlModuleStore(filePath, () => []).load()).toThrow("may not contain commas");
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
  return defaultModules(timestamp);
}
