import { describe, expect, test } from "bun:test";
import {
  EMPTY_MODULE_CONFIG,
  executeModuleAdminRpc,
  formatModuleValidationErrors,
  isModuleAdminRpcName,
  nextModuleId,
  type ManagedModule,
} from "../src/contracts";

const baseModule: ManagedModule = {
  ...EMPTY_MODULE_CONFIG,
  id: 1,
  version: 1,
  created: 1,
  updated: 1,
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

const childModule: ManagedModule = {
  ...baseModule,
  id: 2,
  parentModuleId: 1,
  name: "child",
  title: "Child",
  location: "",
  path: "",
  mfScope: "child",
  accessRole: "",
};

describe("module admin operations", () => {
  test("creates modules with max-id allocation and validation", () => {
    const outcome = executeModuleAdminRpc(
      [baseModule],
      "createModule",
      { module: JSON.stringify(validCreate("beta")) },
      () => 10,
    );

    expect(outcome.result).toEqual({ id: 2, version: 1 });
    expect(outcome.modules[1]).toMatchObject({ id: 2, name: "beta", created: 10, updated: 10 });
    expect(() => executeModuleAdminRpc([baseModule], "createModule", { module: JSON.stringify(validCreate("alpha")) })).toThrow('name: Name "alpha" is already used');
    expect(() => executeModuleAdminRpc([baseModule], "createModule", { module: "{}", extra: true })).toThrow('Unknown RPC param "extra"');
  });

  test("updates versioned modules and rejects stale or invalid edits", () => {
    const outcome = executeModuleAdminRpc(
      [baseModule],
      "updateModule",
      { id: 1, changes: JSON.stringify({ title: "Alpha 2" }), expectedVersion: 1 },
      () => 11,
    );

    expect(outcome.result).toEqual({ id: 1, version: 2 });
    expect(outcome.modules[0]).toMatchObject({ title: "Alpha 2", version: 2, updated: 11 });
    expect(executeModuleAdminRpc([baseModule], "updateModule", { id: 1, changes: JSON.stringify({ title: "Alpha" }), expectedVersion: 1 })).toEqual({ modules: [baseModule], result: { id: 1, version: 1 } });
    expect(() => executeModuleAdminRpc([baseModule], "updateModule", { id: 1, changes: JSON.stringify({ title: "x" }), expectedVersion: 0 })).toThrow("stale update: module alpha is now version 1");
    expect(() => executeModuleAdminRpc([baseModule], "updateModule", { id: 1, changes: JSON.stringify({ name: "x" }), expectedVersion: 1 })).toThrow("Module name can't be changed");
  });

  test("sets enabled without bumping version and validates enabled top-level access", () => {
    const disabled = executeModuleAdminRpc(
      [baseModule],
      "setModuleEnabled",
      { id: 1, enabled: false },
      () => 12,
    );
    expect(disabled.result).toEqual({ id: 1, version: 1 });
    expect(disabled.modules[0]).toMatchObject({ enabled: false, version: 1, updated: 12 });

    const noAccess = { ...baseModule, enabled: false, accessRole: "" };
    expect(() => executeModuleAdminRpc([noAccess], "setModuleEnabled", { id: 1, enabled: true })).toThrow("accessRole: An access role is required to enable a module");
  });

  test("deletes modules and optional children", () => {
    expect(() => executeModuleAdminRpc([baseModule, childModule], "deleteModule", { id: 1 })).toThrow("module alpha has child modules: child");
    expect(executeModuleAdminRpc([baseModule, childModule], "deleteModule", { id: 1, deleteChildren: true })).toEqual({ modules: [], result: { deletedIds: [1, 2] } });
  });

  test("exports helper predicates and formatting", () => {
    expect(isModuleAdminRpcName("createModule")).toBe(true);
    expect(isModuleAdminRpcName("unknown")).toBe(false);
    expect(nextModuleId([{ id: 1 }, { id: 9 }])).toBe(10);
    expect(formatModuleValidationErrors({ name: "bad", title: "missing" })).toBe("name: bad; title: missing");
  });
});

function validCreate(name: string) {
  return {
    ...EMPTY_MODULE_CONFIG,
    name,
    title: name,
    enabled: true,
    location: `/Tools/${name}`,
    path: `/${name}`,
    mfComponent: `${name}Component`,
    mfScope: name.replace(/-/g, ""),
    mfUrl: `https://example.com/${name}.js`,
    accessRole: `${name}-access`,
  };
}
