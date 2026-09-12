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

describe("portal module registry", () => {
  let lifecycle: LifecycleContainer;
  let vuuServer: VuuServer;

  beforeAll(async () => {
    lifecycle = new LifecycleContainer();
    const config = VuuServerConfig(
      VuuWebSocketOptions().withWsPort(0),
      {},
      LoginTokenService(),
    ).withModule(ModuleDiscoveryModule());
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
      ]),
    );

    expect(registry.modules).toEqual([
      expect.objectContaining({
        id: 3,
        name: "basket-trading",
        vuu: {
          connectionId: "basket",
          restUrl: "https://localhost:8445/api/authn",
          websocketUrl: "wss://localhost:8093/websocket-basket-trading",
        },
      }),
      {
        id: 1,
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
          restUrl: "https://localhost:8443/api/authn/module-admin",
          websocketUrl: "wss://localhost:8091/websocket-portal",
        },
      },
      {
        id: 2,
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
    ]);
  });

  test("filters disabled modules and selects the latest permitted version", () => {
    const modules = vuuServer.tableContainer.getTable("modules");
    const permissions = vuuServer.tableContainer.getTable("modulePermissions");
    modules.insert([
      4,
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
      "https://localhost:8443/api/authn/module-admin",
    ]);
    modules.insert([
      5,
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
    permissions.insert([7, 4, "module-admin-access"]);
    permissions.insert([8, 5, "module-admin-access"]);

    const registry = createModuleRegistry(
      vuuServer.tableContainer,
      VuuUserWithAuthorizations("admin", ["module-admin-access"]),
    );

    expect(registry.modules).toEqual([
      expect.objectContaining({
        id: 4,
        description: "Latest module",
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
