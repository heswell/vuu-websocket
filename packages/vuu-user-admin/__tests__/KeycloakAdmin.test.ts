import { describe, expect, test } from "bun:test";
import {
  ConfigFactory,
  LoginTokenService,
  LifecycleContainer,
  VuuServer,
  VuuServerConfig,
  VuuWebSocketOptions,
} from "@heswell/vuu-server";
import { KeycloakAdminClient } from "../src/modules/keycloak-admin/KeycloakAdminClient";
import {
  KEYCLOAK_ADMIN_RPC_CONTRACT,
  KEYCLOAK_ADMIN_TABLE_CONTRACT,
} from "../src/modules/keycloak-admin/KeycloakAdminContract";
import { KeycloakAdminModule } from "../src/modules/keycloak-admin/KeycloakAdminModule";
import {
  clientsTable,
  groupRolesTable,
  groupsTable,
  rolesTable,
  userGroupsTable,
  userGroupRolesTable,
  usersTable,
} from "../src/modules/keycloak-admin/KeycloakAdminTableDefs";
import { KeycloakUsersProvider } from "../src/modules/keycloak-admin/providers/KeycloakUsersProvider";
import { KeycloakAdminService } from "../src/modules/keycloak-admin/services/KeycloakAdminService";

describe("Keycloak admin backend", () => {
  test("reads every user page instead of the seeded users", async () => {
    const originalFetch = globalThis.fetch;
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `u-${index}`,
      username: `user-${index}`,
    }));
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/token")) {
        return new Response(JSON.stringify({ access_token: "test-token" }), { status: 200 });
      }
      if (url.endsWith("/admin/realms/vuu")) {
        return new Response(JSON.stringify({ realm: "vuu", enabled: true }), { status: 200 });
      }
      if (url.includes("/users?")) {
        return new Response(
          JSON.stringify(url.includes("first=0") ? firstPage : [{ id: "u-100", username: "user-100" }]),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected mocked URL ${url}`);
    }) as typeof fetch;

    try {
      process.env.VUU_CONFIG_FILE = "packages/vuu-user-admin/application.conf";
      const client = await KeycloakAdminClient.createFromConfig();
      const users = await client.listUsers();
      expect(users).toHaveLength(101);
      expect(users.at(-1)?.username).toBe("user-100");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.VUU_CONFIG_FILE;
      ConfigFactory.reset();
    }
  });

  test("scopes client and client-role reads to vuu clients while retaining realm roles", async () => {
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      if (url.includes("/token")) {
        return new Response(JSON.stringify({ access_token: "test-token" }), { status: 200 });
      }
      if (url.endsWith("/admin/realms/vuu")) {
        return new Response(JSON.stringify({ realm: "vuu", enabled: true }), { status: 200 });
      }
      if (url.includes("/clients?")) {
        return new Response(
          JSON.stringify([
            { id: "vuu-client-internal", clientId: "vuu-orders", name: "Orders" },
            { id: "other-client-internal", clientId: "other-app", name: "Other" },
          ]),
          { status: 200 },
        );
      }
      if (url.includes("/clients/vuu-client-internal/roles?")) {
        return new Response(
          JSON.stringify([{ id: "role-1", name: "trader", clientRole: true }]),
          { status: 200 },
        );
      }
      if (url.includes("/roles?")) {
        return new Response(
          JSON.stringify([{ id: "realm-role-1", name: "operator", clientRole: false }]),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected mocked URL ${url}`);
    }) as typeof fetch;

    try {
      process.env.VUU_CONFIG_FILE = "packages/vuu-user-admin/application.conf";
      const client = await KeycloakAdminClient.createFromConfig();
      const clients = await client.listClients();
      expect(clients.map(({ clientId }) => clientId)).toEqual(["vuu-orders"]);
      expect(await client.listClientRoles(clients[0]!)).toEqual([
        { id: "role-1", name: "trader", clientRole: true },
      ]);
      expect(await client.listRealmRoles()).toEqual([
        { id: "realm-role-1", name: "operator", clientRole: false },
      ]);
      await expect(
        client.listClientRoles({ id: "other-client-internal", clientId: "other-app" }),
      ).rejects.toThrow('Keycloak client identifier must start with "vuu-"');
      await expect(
        client.listClientRolesForGroup("group-1", {
          id: "other-client-internal",
          clientId: "other-app",
        }),
      ).rejects.toThrow('Keycloak client identifier must start with "vuu-"');
      expect(requests.some((url) => url.includes("other-client-internal/roles"))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.VUU_CONFIG_FILE;
      ConfigFactory.reset();
    }
  });

  test("provider maps a snapshot into VUU rows", () => {
    const rows: unknown[][] = [];
    const table = {
      indexOfKeyField: 0,
      rows,
      upsert: (row: unknown[]) => rows.push(row),
      delete: () => undefined,
      rowIndexAtKey: () => -1,
    };
    const provider = new KeycloakUsersProvider(table as never);
    provider.loadSnapshot({
      realm: { realm: "vuu" },
      users: [{
        id: "u1",
        username: "alice",
        enabled: true,
        requiredActions: ["UPDATE_PASSWORD"],
        createdTimestamp: 456,
      }],
      groups: [],
      clients: [],
      realmRoles: [],
      clientRoles: [],
      userGroups: [],
      groupRoles: [],
      timestamp: 123,
    });
    expect(rows[0]).toEqual([
      "u1",
      "alice",
      "",
      "",
      "",
      true,
      false,
      true,
      0,
      456,
      0,
      0,
      123,
      123,
      "",
    ]);
  });

  test("rejects invalid mutation parameters before creating a Keycloak client", async () => {
    const service = new KeycloakAdminService(
      {} as never,
      async () => {
        throw new Error("client should not be created");
      },
    );
    const result = await service.processRpcRequest("addUser", {
      namedParams: { username: " " },
      viewport: {} as never,
      ctx: {} as never,
    });
    expect(result).toEqual({
      type: "ERROR_RESULT",
      errorMessage: 'Invalid RPC param "username"',
    });
  });

  test("rejects non-vuu client mutations before creating a Keycloak client", async () => {
    const service = new KeycloakAdminService(
      {} as never,
      async () => {
        throw new Error("client should not be created");
      },
    );
    const requests = [
      ["addClient", { clientId: "other-app" }],
      ["updateClient", { clientId: "other-app", name: "Other" }],
      ["addClientRole", { clientId: "other-app", name: "reader" }],
      ["updateRole", { clientId: "other-app", roleName: "reader", name: "writer" }],
      ["assignGroupRole", {
        groupId: "group-1",
        roleId: "role-1",
        clientId: "other-app",
      }],
      ["removeGroupRole", {
        groupId: "group-1",
        roleId: "role-1",
        clientId: "other-app",
      }],
    ] as const;

    for (const [rpcName, namedParams] of requests) {
      const result = await service.processRpcRequest(rpcName, {
        namedParams,
        viewport: {} as never,
        ctx: {} as never,
      });
      expect(result).toEqual({
        type: "ERROR_RESULT",
        errorMessage: 'Keycloak client identifier must start with "vuu-"',
      });
    }
  });

  test("defines the complete VUU contract and module", () => {
    const tables = [
      usersTable,
      groupsTable,
      clientsTable,
      rolesTable,
      userGroupsTable,
      groupRolesTable,
      userGroupRolesTable,
    ];
    expect(tables.map(({ name }) => name)).toEqual([
      "users",
      "groups",
      "clients",
      "roles",
      "user_groups",
      "group_roles",
      "user_group_roles",
    ]);
    for (const table of tables) {
      expect(
        table.columns
          .filter(({ name }) => !name.startsWith("vuu"))
          .map(({ name }) => name),
      ).toEqual(KEYCLOAK_ADMIN_TABLE_CONTRACT[table.name as keyof typeof KEYCLOAK_ADMIN_TABLE_CONTRACT]);
    }
    expect(KeycloakAdminModule()).toBeDefined();
    expect(KEYCLOAK_ADMIN_RPC_CONTRACT.addUser).toContain("temporary_password");
    expect(KEYCLOAK_ADMIN_RPC_CONTRACT.updateUser).toContain("group_ids");
    expect(KEYCLOAK_ADMIN_RPC_CONTRACT.assignGroupRole).toContain("clientId");
  });

  test("registers clients in the runtime table container", () => {
    const server = new VuuServer(
      VuuServerConfig(
        VuuWebSocketOptions().withWsPort(0),
        {},
        LoginTokenService(),
        [KeycloakAdminModule()],
      ),
      new LifecycleContainer(),
    );

    expect(server.tableContainer.getDefinedTables()).toContainEqual({
      module: "KEYCLOAK_ADMIN",
      table: "clients",
    });
    expect(server.tableContainer.getTable("clients").schema.table).toEqual({
      module: "KEYCLOAK_ADMIN",
      table: "clients",
    });
  });
});
