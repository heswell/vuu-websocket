import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  LifecycleContainer,
  LoginTokenService,
  VuuServer,
  VuuServerConfig,
  VuuUserWithAuthorizations,
  VuuWebSocketOptions,
} from "@heswell/vuu-server";
import { createModuleRegistry } from "../src/ModuleRegistry";
import { ModuleDiscoveryModule } from "../src/modules/ModuleDiscovery/ModuleDiscoveryModule";

const moduleAccessRoles = [
  { moduleName: "moduleAdmin", role: "module-admin-access" },
  { moduleName: "userAdmin", role: "user-admin-access" },
  { moduleName: "basket-trading", role: "basket-trading-access" },
  { moduleName: "vuu-table-browser", role: "vuu-table-browser-access" },
  { moduleName: "vuu-table-viewer", role: "vuu-table-viewer-access" },
];

describe("portal module registry", () => {
  let lifecycle: LifecycleContainer;
  let vuuServer: VuuServer;

  beforeAll(async () => {
    lifecycle = new LifecycleContainer();
    const config = VuuServerConfig(
      VuuWebSocketOptions().withWsPort(0),
      {},
      LoginTokenService(),
    ).withModule(ModuleDiscoveryModule(moduleAccessRoles));
    vuuServer = new VuuServer(config, lifecycle);
    await lifecycle.start();
  });

  afterAll(async () => {
    await lifecycle.stop();
  });

  test("serializes authorized remotes with their target server connections", () => {
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
        clientIdentifier: "vuu-portal",
        id: 3,
        accessRole: "basket-trading-access",
        name: "basket-trading",
        mfUrl: "http://localhost:5006",
        vuu: {
          connectionId: "basket",
          restUrl: "https://localhost:8445/api/authn",
          websocketUrl: "wss://localhost:8093/websocket-basket-trading",
        },
      }),
      {
        clientIdentifier: "vuu-portal",
        id: 1,
        accessRole: "module-admin-access",
        name: "moduleAdmin",
        title: "Manage remote modules",
        description: "Create new remote module, update existing modules",
        version: 1,
        enabled: true,
        location: "/Modules/Manage Modules",
        path: "/modules/admin",
        mfComponent: "ModuleAdmin",
        mfScope: "ModuleAdmin",
        mfUrl: "http://localhost:5002",
        vuu: {
          connectionId: "module-admin",
          restUrl: "https://localhost:8443/api/authn",
          websocketUrl: "wss://localhost:8091/websocket-portal",
        },
      },
      {
        clientIdentifier: "vuu-portal",
        id: 2,
        accessRole: "user-admin-access",
        name: "userAdmin",
        title: "Manage users",
        description: "Add, remove and update users",
        version: 1,
        enabled: true,
        location: "/Users/Manage Users",
        path: "/users/admin",
        mfComponent: "UserAdmin",
        mfScope: "UserAdmin",
        mfUrl: "http://localhost:5003",
        vuu: {
          connectionId: "user-admin",
          restUrl: "https://localhost:8444/api/authn",
          websocketUrl: "wss://localhost:8092/websocket-user-admin",
        },
      },
      {
        clientIdentifier: "vuu-portal",
        id: 4,
        accessRole: "vuu-table-browser-access",
        name: "vuu-table-browser",
        title: "Browse tables",
        description: "Discover and browse VUU tables",
        version: 1,
        enabled: true,
        location: "/Tools/Tables",
        path: "/tools/tables",
        mfComponent: "VuuTableBrowser",
        mfScope: "vuuTableBrowser",
        mfUrl: "http://localhost:5004",
        nestedModules: [
          {
            name: "vuu-table-viewer",
            mfComponent: "VuuTableViewer",
            mfScope: "vuuTableViewer",
            mfUrl: "http://localhost:5005",
          },
        ],
      },
    ]);
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
    expect(browserOnly.modules[0]).not.toHaveProperty("nestedModules");
    expect(viewerOnly).toEqual({ modules: [] });
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
      "module-admin",
      "wss://localhost:8091/websocket-portal",
      "https://localhost:8443/api/authn",
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
      "portal",
      "",
      "",
    ]);
    permissions.insert([7, 6, "module-admin-access"]);
    permissions.insert([8, 7, "module-admin-access"]);

    const registry = createModuleRegistry(
      vuuServer.tableContainer,
      VuuUserWithAuthorizations("admin", ["module-admin-access"]),
    );

    expect(registry.modules).toEqual([
      expect.objectContaining({
        clientIdentifier: "vuu-portal",
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
