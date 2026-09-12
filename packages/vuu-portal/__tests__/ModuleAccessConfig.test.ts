import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  loadModuleAccessRoles,
  ModuleDiscoveryModule,
} from "../src/modules/ModuleDiscovery/ModuleDiscoveryModule";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("portal module access configuration", () => {
  test("loads module access roles from YAML", () => {
    const filePath = writeConfig(`
moduleAccess:
  moduleAdmin: module-admin-access
  userAdmin: user-admin-access
`);

    expect(
      loadModuleAccessRoles({
        getPath: () => filePath,
      }),
    ).toEqual([
      { moduleName: "moduleAdmin", role: "module-admin-access" },
      { moduleName: "userAdmin", role: "user-admin-access" },
    ]);
  });

  test("rejects an invalid module access root", () => {
    const filePath = writeConfig("modules: {}");

    expect(() =>
      loadModuleAccessRoles({
        getPath: () => filePath,
      }),
    ).toThrow("must contain a 'moduleAccess' object");
  });

  test("rejects access configuration for an unknown module", () => {
    expect(() =>
      ModuleDiscoveryModule([{ moduleName: "unknown", role: "unknown-access" }]),
    ).toThrow("references unknown module 'unknown'");
  });
});

function writeConfig(contents: string) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "vuu-portal-module-access-"),
  );
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, "module-access.yaml");
  fs.writeFileSync(filePath, contents);
  return filePath;
}
