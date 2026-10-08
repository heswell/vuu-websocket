import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MODULE_DEFINITIONS,
  MODULE_NAV_ICONS,
  moduleDefinitionsToRows,
  modulePermissionsFor,
} from "../src/contracts";

describe("module discovery contract", () => {
  test("provides the default module catalog as table rows", () => {
    expect(moduleDefinitionsToRows(DEFAULT_MODULE_DEFINITIONS)).toEqual([
      [
        1,
        0,
        "moduleAdmin",
        "Manage remote modules",
        "Create new remote module, update existing modules",
        1,
        true,
        "/Modules/Manage Modules",
        "/modules/admin",
        "ModuleAdmin",
        "moduleAdmin",
        "http://localhost:5002",
        MODULE_NAV_ICONS.modules,
      ],
      expect.any(Array),
      expect.any(Array),
      [
        4,
        0,
        "vuu-table-browser",
        "Browse tables",
        "Discover and browse VUU tables",
        1,
        true,
        "/Tools/Tables",
        "/tools/tables",
        "VuuTableBrowser",
        "vuuTableBrowser",
        "http://localhost:5004",
        MODULE_NAV_ICONS.tables,
      ],
      [
        5,
        4,
        "vuu-table-viewer",
        "View table",
        "View a selected VUU table",
        1,
        true,
        "",
        "",
        "VuuTableViewer",
        "vuuTableViewer",
        "http://localhost:5005",
        "",
      ],
    ]);
  });

  test("creates module permissions from configured access roles", () => {
    expect(
      modulePermissionsFor(DEFAULT_MODULE_DEFINITIONS, [
        { moduleName: "moduleAdmin", role: "module-admin-access" },
        { moduleName: "userAdmin", role: "user-admin-access" },
        { moduleName: "vuu-table-browser", role: "vuu-table-browser-access" },
        { moduleName: "vuu-table-viewer", role: "vuu-table-viewer-access" },
      ]),
    ).toEqual([
      [1, 1, "module-admin-access"],
      [2, 2, "user-admin-access"],
      [3, 4, "vuu-table-browser-access"],
      [4, 5, "vuu-table-viewer-access"],
    ]);
  });

  test("rejects permissions for modules outside the catalog", () => {
    expect(() =>
      modulePermissionsFor(DEFAULT_MODULE_DEFINITIONS, [
        { moduleName: "unknown", role: "unknown-access" },
      ]),
    ).toThrow("references unknown module 'unknown'");
  });
});

import {
  defaultAccessRole,
  EMPTY_MODULE_CONFIG,
  managedModuleColumnValues,
  managedModulePermissionValues,
  parseModuleConfig,
  parseModuleConfigChanges,
  toManagedModules,
  validateModuleConfig,
} from "../src/contracts";

const validConfig = {
  ...EMPTY_MODULE_CONFIG,
  name: "alpha",
  title: "Alpha",
  enabled: true,
  location: "/Tools/Alpha",
  path: "/alpha",
  mfComponent: "Alpha",
  mfScope: "alpha",
  mfUrl: "https://example.com/alpha.js",
  accessRole: "alpha-access",
};

describe("module administration contract", () => {
  test("validates required fields, uniqueness, parent, location and access rules", () => {
    const existing = [{ ...validConfig, id: 1, version: 1, created: 1, updated: 1 }];
    expect(validateModuleConfig({ ...validConfig, name: "" }, [])).toMatchObject({ name: expect.any(String) });
    expect(validateModuleConfig({ ...validConfig, name: "bad name" }, [])).toMatchObject({ name: expect.any(String) });
    expect(validateModuleConfig({ ...validConfig, name: "alpha", mfScope: "alpha2", path: "/alpha2" }, existing)).toMatchObject({ name: expect.any(String) });
    expect(validateModuleConfig({ ...validConfig, name: "beta", mfScope: "alpha", path: "/beta" }, existing)).toMatchObject({ mfScope: expect.any(String) });
    expect(validateModuleConfig({ ...validConfig, name: "beta", mfScope: "beta", parentModuleId: 99 }, existing)).toMatchObject({ parentModuleId: expect.any(String) });
    expect(validateModuleConfig({ ...validConfig, location: "Tools/Alpha" }, [])).toMatchObject({ location: expect.any(String) });
    expect(validateModuleConfig({ ...validConfig, accessRole: "" }, [])).toMatchObject({ accessRole: expect.any(String) });
  });

  test("parses configs and changes strictly", () => {
    expect(parseModuleConfig(JSON.stringify({ name: " alpha ", enabled: true }))).toMatchObject({ name: "alpha", enabled: true });
    expect(() => parseModuleConfig(JSON.stringify({ unknown: true }))).toThrow("Unknown module field");
    expect(() => parseModuleConfig(JSON.stringify({ enabled: "yes" }))).toThrow("must be a boolean");
    expect(() => parseModuleConfigChanges(JSON.stringify({ name: "beta" }))).toThrow("can't be changed");
  });

  test("projects managed modules and permissions", () => {
    expect(defaultAccessRole("userAdmin")).toBe("user-admin-access");
    const modules = toManagedModules(DEFAULT_MODULE_DEFINITIONS, [{ moduleName: "moduleAdmin", role: "module-admin-access" }], 123);
    expect(modules[0]).toMatchObject({ id: 1, created: 123, updated: 123, accessRole: "module-admin-access" });
    expect(managedModuleColumnValues(modules[0])).toMatchObject({ id: 1, vuuCreatedTimestamp: 123 });
    expect(managedModulePermissionValues(modules)).toEqual([
      expect.objectContaining({ id: 1, module_id: 1, role: "module-admin-access" }),
    ]);
  });
});
