import { describe, expect, test } from "bun:test";
import * as portal from "../src/index";

describe("@heswell/vuu-portal root exports", () => {
  test("exports the library API as runtime values", () => {
    expect(typeof portal.createModuleRegistry).toBe("function");
    expect(typeof portal.ModuleDiscoveryModule).toBe("function");
    expect(typeof portal.loadModuleState).toBe("function");
    expect(typeof portal.loadModuleAdminRole).toBe("function");
    expect(typeof portal.ModuleState).toBe("function");
  });

  test("does not export a default portal starter", () => {
    expect("default" in portal).toBe(false);
  });

  test("loadModuleAdminRole reads vuu.portal.moduleAdminRole", () => {
    const config = {
      getString: (key: string, defaultValue?: string) =>
        key === "vuu.portal.moduleAdminRole" ? "custom-role" : defaultValue!,
    };
    expect(portal.loadModuleAdminRole(config)).toBe("custom-role");
  });
});

