import { afterAll, beforeAll, describe, expect, test } from "bun:test";

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
}
import {
  LifecycleContainer,
  LoginTokenService,
  VuuServer,
  VuuServerConfig,
  VuuUserWithAuthorizations,
  VuuWebSocketOptions,
} from "@heswell/vuu-server";
import {
  createModuleRegistry,
  moduleClientIdentifier,
} from "../src/ModuleRegistry";
import { InMemoryModuleStore, ModuleDiscoveryModule, ModuleState } from "../src/modules/ModuleDiscovery/ModuleDiscoveryModule";
import { defaultModules, navIconUrl } from "./defaultModules";

describe("portal module registry", () => {
  let lifecycle: LifecycleContainer;
  let vuuServer: VuuServer;

  beforeAll(async () => {
    lifecycle = new LifecycleContainer();
    const config = VuuServerConfig(
      VuuWebSocketOptions().withWsPort(0),
      {},
      LoginTokenService(),
    ).withModule(ModuleDiscoveryModule(moduleState()));
    vuuServer = new VuuServer(config, lifecycle);
    await lifecycle.start();
  });

  afterAll(async () => {
    await lifecycle.stop();
  });

  test("serializes authorized modules", () => {
    const registry = createModuleRegistry(
      vuuServer.tableContainer,
      VuuUserWithAuthorizations("admin", [
        "module-admin-access",
        "user-admin-access",
        "basket-trading-access",
        "vuu-table-browser-access",
        "vuu-table-viewer-access",
      ]),
    );

    expect(registry.modules).toEqual([
      expect.objectContaining({
        clientIdentifier: "vuu-basket-trading",
        id: 3,
        accessRole: "basket-trading-access",
        name: "basket-trading",
        mfUrl: "http://localhost:5006",
        navIconUrl: navIconUrl("basket-trading"),
      }),
      {
        clientIdentifier: "vuu-module-admin",
        id: 1,
        accessRole: "module-admin-access",
        name: "moduleAdmin",
        title: "Manage remote modules",
        description: "Create new remote module, update existing modules",
        version: 1,
        enabled: true,
        navLocation: "/Modules/Manage Modules",
        path: "/modules/admin",
        mfComponent: "ModuleAdmin",
        mfScope: "moduleAdmin",
        mfUrl: "http://localhost:5002",
        navIconUrl: navIconUrl("moduleAdmin"),
      },
      {
        clientIdentifier: "vuu-user-admin",
        id: 2,
        accessRole: "user-admin-access",
        name: "userAdmin",
        title: "Manage users",
        description: "Add, remove and update users",
        version: 1,
        enabled: true,
        navLocation: "/Users/Manage Users",
        path: "/users/admin",
        mfComponent: "UserAdmin",
        mfScope: "userAdmin",
        mfUrl: "http://localhost:5003",
        navIconUrl: navIconUrl("userAdmin"),
      },
      {
        clientIdentifier: "vuu-table-browser",
        id: 4,
        accessRole: "vuu-table-browser-access",
        name: "vuu-table-browser",
        title: "Browse tables",
        description: "Discover and browse VUU tables",
        version: 1,
        enabled: true,
        navLocation: "/Tools/Tables",
        path: "/tools/tables",
        mfComponent: "VuuTableBrowser",
        mfScope: "vuuTableBrowser",
        mfUrl: "http://localhost:5004",
        navIconUrl: navIconUrl("vuu-table-browser"),
      },
      {
        clientIdentifier: "vuu-table-viewer",
        id: 5,
        accessRole: "vuu-table-viewer-access",
        name: "vuu-table-viewer",
        title: "View table",
        description: "View a selected VUU table",
        version: 1,
        enabled: true,
        navLocation: "",
        path: "",
        mfComponent: "VuuTableViewer",
        mfScope: "vuuTableViewer",
        mfUrl: "http://localhost:5005",
      },
    ]);
  });

  test("gives every module its own client identifier", () => {
    expect(moduleClientIdentifier("userAdmin")).toBe("vuu-user-admin");
    expect(moduleClientIdentifier("moduleAdmin")).toBe("vuu-module-admin");
    expect(moduleClientIdentifier("basket-trading")).toBe("vuu-basket-trading");
    expect(moduleClientIdentifier("vuu-table-viewer")).toBe("vuu-table-viewer");
  });

  test("discovers the viewer only as an independently authorized browser child", () => {
    const browserOnly = createModuleRegistry(
      vuuServer.tableContainer,
      VuuUserWithAuthorizations("browser-only", ["vuu-table-browser-access"]),
    );
    const viewerOnly = createModuleRegistry(
      vuuServer.tableContainer,
      VuuUserWithAuthorizations("viewer-only", ["vuu-table-viewer-access"]),
    );

    expect(browserOnly.modules).toEqual([
      expect.objectContaining({
        name: "vuu-table-browser",
        path: "/tools/tables",
      }),
    ]);
    expect(browserOnly.modules[0]).not.toHaveProperty("vuu");
    expect(viewerOnly).toEqual({ modules: [] });
  });


  test("child modules inherit the parent permission when they have no permission row", () => {
    const permissions = vuuServer.tableContainer.getTable("modulePermissions");
    permissions.delete("5");

    const registry = createModuleRegistry(
      vuuServer.tableContainer,
      VuuUserWithAuthorizations("browser-only", ["vuu-table-browser-access"]),
    );

    expect(registry.modules).toEqual([
      expect.objectContaining({ name: "vuu-table-browser", accessRole: "vuu-table-browser-access" }),
      expect.objectContaining({ name: "vuu-table-viewer", accessRole: "vuu-table-browser-access" }),
    ]);
  });

  test("filters disabled modules and selects the latest permitted version", () => {
    const modules = vuuServer.tableContainer.getTable("modules");
    const permissions = vuuServer.tableContainer.getTable("modulePermissions");
    modules.insert([
      6,
      0,
      "moduleAdmin",
      "Manage remote modules",
      "Latest module",
      2,
      true,
      "/Modules/Manage Modules",
      "/modules/admin",
      "ModuleAdmin",
      "ModuleAdmin",
      "http://localhost:5011",
    ]);
    modules.insert([
      7,
      0,
      "moduleAdmin",
      "Manage remote modules",
      "Disabled module",
      3,
      false,
      "/Modules/Manage Modules",
      "/modules/admin",
      "ModuleAdmin",
      "ModuleAdmin",
      "http://localhost:5012",
    ]);
    permissions.insert([7, 6, "module-admin-access"]);
    permissions.insert([8, 7, "module-admin-access"]);

    const registry = createModuleRegistry(
      vuuServer.tableContainer,
      VuuUserWithAuthorizations("admin", ["module-admin-access"]),
    );

    expect(registry.modules).toEqual([
      expect.objectContaining({
        clientIdentifier: "vuu-module-admin",
        id: 6,
        description: "Latest module",
        accessRole: "module-admin-access",
        version: 2,
      }),
    ]);
  });

  test("returns no modules without a matching permission", () => {
    const registry = createModuleRegistry(
      vuuServer.tableContainer,
      VuuUserWithAuthorizations("no-access"),
    );

    expect(registry).toEqual({ modules: [] });
  });

  test("does not select modules from remote resource roles", () => {
    const registry = createModuleRegistry(
      vuuServer.tableContainer,
      VuuUserWithAuthorizations("remote-only", [
        "module-admin-view",
        "user-admin-view",
        "basket-trading-view",
      ]),
    );

    expect(registry).toEqual({ modules: [] });
  });
});


function moduleState() {
  const modules = defaultModules();
  return new ModuleState(new InMemoryModuleStore(modules), modules);
}
