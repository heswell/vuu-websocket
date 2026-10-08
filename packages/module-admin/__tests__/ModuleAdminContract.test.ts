import { describe, expect, test } from "bun:test";
import {
  defaultAccessRole,
  EMPTY_MODULE_CONFIG,
  managedModuleColumnValues,
  managedModulePermissionValues,
  parseModuleConfig,
  parseModuleConfigChanges,
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
    const modules = [
      { ...validConfig, id: 1, version: 1, created: 123, updated: 123 },
      { ...validConfig, name: "beta", accessRole: "", id: 2, version: 1, created: 123, updated: 123 },
    ];
    expect(managedModuleColumnValues(modules[0])).toMatchObject({ id: 1, vuuCreatedTimestamp: 123 });
    expect(managedModulePermissionValues(modules)).toEqual([
      expect.objectContaining({ id: 1, module_id: 1, role: "alpha-access" }),
    ]);
  });
});
