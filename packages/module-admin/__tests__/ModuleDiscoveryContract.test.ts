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
    ]);
  });

  test("creates module permissions from configured access roles", () => {
    expect(
      modulePermissionsFor(DEFAULT_MODULE_DEFINITIONS, [
        { moduleName: "moduleAdmin", role: "module-admin-access" },
        { moduleName: "userAdmin", role: "user-admin-access" },
      ]),
    ).toEqual([
      [1, 1, "module-admin-access"],
      [2, 2, "user-admin-access"],
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
