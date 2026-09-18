import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MODULE_DEFINITIONS,
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
        "ModuleAdmin",
        "http://localhost:5002",
        "module-admin",
        "wss://localhost:8091/websocket-portal",
        "https://localhost:8443/api/authn",
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
        "",
        "",
        "",
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
        "",
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
