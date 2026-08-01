import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  AuthProvider,
  LifecycleContainer,
  LoginTokenService,
  VuuServer,
  VuuServerConfig,
  VuuUserWithAuthorizations,
  VuuWebSocketOptions,
} from "@heswell/vuu-server";
import { ModuleDiscoveryModule } from "../src/ModuleDiscoveryModule";
import { createModuleRegistryHttpHandler } from "../src/ModuleRegistryHandler";

describe("module registry handler", () => {
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

  test("returns a module authorized by role", async () => {
    const response = await requestModules(["module-admin:view"]);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      modules: [
        {
          id: 1,
          name: "module-admin",
          title: "Manage remote modules",
          description: "Create new remote module, update existing modules",
          version: 1,
          enabled: true,
          location: "/Modules/Manage Modules",
          mfComponent: "ModuleAdmin",
          mfScope: "ModuleAdmin",
          mfUrl: "http://localhost:5008",
        },
      ],
    });
  });

  test("returns a module authorized by username", async () => {
    vuuServer.tableContainer
      .getTable("moduleUsers")
      .insert([1, 2, "alice"]);

    const response = await requestModules([], "alice");

    expect(await response.json()).toEqual({
      modules: [
        expect.objectContaining({ id: 2, name: "user-admin" }),
      ],
    });
  });

  test("filters disabled modules and selects the latest version", async () => {
    const modules = vuuServer.tableContainer.getTable("modules");
    const permissions = vuuServer.tableContainer.getTable("modulePermissions");
    modules.insert([
      3,
      "module-admin",
      "Manage remote modules",
      "Disabled module",
      2,
      false,
      "/Modules/Disabled",
      "DisabledModuleAdmin",
      "DisabledModuleAdmin",
      "http://localhost:5010",
    ]);
    modules.insert([
      4,
      "module-admin",
      "Manage remote modules",
      "Latest module",
      3,
      true,
      "/Modules/Manage Modules",
      "ModuleAdmin",
      "ModuleAdmin",
      "http://localhost:5011",
    ]);
    permissions.insert([5, 3, "module-admin:view"]);
    permissions.insert([6, 4, "module-admin:view"]);

    const response = await requestModules(["module-admin:view"]);
    const { modules: discoveredModules } = await response.json();

    expect(discoveredModules).toEqual([
      expect.objectContaining({
        id: 4,
        description: "Latest module",
        version: 3,
      }),
    ]);
  });

  test("selects the greatest id for equal module versions", async () => {
    const modules = vuuServer.tableContainer.getTable("modules");
    const permissions = vuuServer.tableContainer.getTable("modulePermissions");
    modules.insert([
      5,
      "user-admin",
      "Manage users",
      "Replacement user administration",
      1,
      true,
      "/Users/Manage Users",
      "UserAdmin",
      "UserAdmin",
      "http://localhost:5012",
    ]);
    permissions.insert([7, 5, "user-admin:view"]);

    const response = await requestModules(["user-admin:view"]);

    expect(await response.json()).toEqual({
      modules: [
        expect.objectContaining({
          id: 5,
          description: "Replacement user administration",
          version: 1,
        }),
      ],
    });
  });

  test("returns no modules when the user has no matching access row", async () => {
    const response = await requestModules([], "no-access");

    expect(await response.json()).toEqual({ modules: [] });
  });

  test("rejects missing bearer authentication", async () => {
    const handler = createModuleRegistryHttpHandler(
      authenticatedProvider([]),
      () => vuuServer.tableContainer,
    );
    const request = new Request("https://localhost:8443/module-registry");

    const response = await handler(request, new URL(request.url));

    expect(response?.status).toBe(401);
  });

  function requestModules(authorizations: string[], username = "test-user") {
    const handler = createModuleRegistryHttpHandler(
      authenticatedProvider(authorizations, username),
      () => vuuServer.tableContainer,
    );
    const request = new Request("https://localhost:8443/module-registry", {
      headers: { Authorization: "Bearer test-token" },
    });

    return handler(request, new URL(request.url)) as Promise<Response>;
  }
});

function authenticatedProvider(
  authorizations: string[],
  username = "test-user",
): AuthProvider {
  return {
    authenticate: async (name) => VuuUserWithAuthorizations(name),
    authenticateBearerToken: async () =>
      VuuUserWithAuthorizations(username, authorizations),
  };
}
