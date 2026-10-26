import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { loadDefaultModules, YamlModuleStore } from "../src/modules/ModuleDiscovery/ModuleStore";
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

  test("round-trips workspace metadata and omits it when unset", () => {
    const filePath = path.join(root, "modules.yaml");
    const store = new YamlModuleStore(filePath, () => []);
    const [first, ...rest] = seeded(100);
    const workspace = {
      paletteGroup: "Trading",
      iconUrl: "https://example.com/ticket.svg",
      defaultSize: { cols: 6, rows: 4 },
    };
    const modules = [{ ...first, workspace }, ...rest];
    store.save(modules);

    expect(store.load()).toEqual(modules);
    const saved = Bun.YAML.parse(fs.readFileSync(filePath, "utf8")) as {
      modules: Record<string, unknown>[];
    };
    expect(saved.modules[0].workspace).toEqual(workspace);
    const browser = saved.modules.find(({ name }) => name === "vuu-table-browser");
    expect(browser).toBeDefined();
    expect(browser).not.toHaveProperty("workspace");
  });

  test("round-trips a palette-only top-level module without location or path", () => {
    const filePath = path.join(root, "modules.yaml");
    const store = new YamlModuleStore(filePath, () => []);
    const [first, ...rest] = seeded(100);
    const modules = [
      {
        ...first,
        location: "",
        path: "",
        workspace: { paletteGroup: "Trading" },
      },
      ...rest,
    ];
    store.save(modules);

    expect(new YamlModuleStore(filePath, () => []).load()).toEqual(modules);
  });

  test("loads palette-only modules that omit location and path", () => {
    fs.mkdirSync(root, { recursive: true });
    const filePath = path.join(root, "default-modules.yaml");
    const write = (overrides: Record<string, unknown>) => {
      const { location: _location, path: _path, created: _created, updated: _updated, ...entry } = {
        ...seeded(100)[0],
        ...overrides,
      };
      fs.writeFileSync(filePath, Bun.YAML.stringify({ modules: [entry] }), "utf8");
    };

    write({ workspace: { paletteGroup: "Trading" } });
    expect(loadDefaultModules(filePath, 5)[0]).toMatchObject({
      location: "",
      path: "",
      workspace: { paletteGroup: "Trading" },
    });

    write({ workspace: null });
    expect(() => loadDefaultModules(filePath, 5)).toThrow(
      "location: Menu location is required; path: Route is required",
    );
  });

  test("rejects invalid workspace metadata", () => {
    fs.mkdirSync(root, { recursive: true });
    const filePath = path.join(root, "modules.yaml");
    const write = (workspace: unknown) =>
      fs.writeFileSync(
        filePath,
        Bun.YAML.stringify({ modules: [{ ...seeded(100)[0], workspace }] }),
        "utf8",
      );
    const load = () => new YamlModuleStore(filePath, () => []).load();

    write("Trading");
    expect(load).toThrow("field 'workspace' must be an object");
    write({ group: "Trading" });
    expect(load).toThrow('workspace: Workspace has unknown field "group"');
    write({ paletteGroup: "Trading", defaultSize: { cols: 0 } });
    expect(load).toThrow("workspace: Workspace default size cols must be a positive integer");
    write(null);
    expect(load()[0]).not.toHaveProperty("workspace");
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
