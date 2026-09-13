import { describe, expect, test } from "bun:test";
import {
  ConfigFactory,
  LoginTokenService,
  LifecycleContainer,
  VuuServer,
  VuuServerConfig,
  VuuWebSocketOptions,
} from "@heswell/vuu-server";
import {
  buildUserModuleAccessOptions,
  KeycloakAdminClient,
  planUserModuleAccessChanges,
  type KeycloakAdminSnapshot,
} from "../src/modules/keycloak-admin/KeycloakAdminClient";
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
import { KeycloakGroupRolesProvider } from "../src/modules/keycloak-admin/providers/KeycloakGroupRolesProvider";
import { KeycloakGroupsProvider } from "../src/modules/keycloak-admin/providers/KeycloakGroupsProvider";
import { KeycloakRolesProvider } from "../src/modules/keycloak-admin/providers/KeycloakRolesProvider";
import { KeycloakUserGroupRolesProvider } from "../src/modules/keycloak-admin/providers/KeycloakUserGroupRolesProvider";
import {
  groupRoleCount,
  userModuleAccess,
  userRoleCount,
} from "../src/modules/keycloak-admin/providers/snapshotCounts";
import { KeycloakAdminService } from "../src/modules/keycloak-admin/services/KeycloakAdminService";

describe("Keycloak admin backend", () => {
  const moduleAccessSnapshot = {
    realm: { realm: "vuu" },
    users: [
      { id: "u1", username: "alice" },
      { id: "u2", username: "bob" },
    ],
    groups: [
      { id: "users", name: "Users", path: "/vuu/orders/users" },
      { id: "traders", name: "Traders", path: "/vuu/orders/traders" },
      { id: "unrelated", name: "Unrelated", path: "/vuu/unrelated" },
    ],
    clients: [
      { id: "portal", clientId: "vuu-portal" },
      { id: "orders", clientId: "vuu-orders" },
    ],
    clientRoles: [
      {
        client: { id: "portal", clientId: "vuu-portal" },
        role: { id: "orders-access", name: "orders-access" },
      },
    ],
    userGroups: [
      {
        user: { id: "u1", username: "alice" },
        group: { id: "users", name: "Users", path: "/vuu/orders/users" },
      },
      {
        user: { id: "u1", username: "alice" },
        group: { id: "unrelated", name: "Unrelated", path: "/vuu/unrelated" },
      },
    ],
    groupRoles: [
      {
        group: { id: "users", name: "Users", path: "/vuu/orders/users" },
        client: { id: "portal", clientId: "vuu-portal" },
        role: { id: "orders-access", name: "orders-access" },
      },
      {
        group: { id: "traders", name: "Traders", path: "/vuu/orders/traders" },
        client: { id: "portal", clientId: "vuu-portal" },
        role: { id: "orders-access", name: "orders-access" },
      },
      {
        group: { id: "users", name: "Users", path: "/vuu/orders/users" },
        client: { id: "orders", clientId: "vuu-orders" },
        role: { id: "read", name: "read" },
      },
      {
        group: { id: "traders", name: "Traders", path: "/vuu/orders/traders" },
        client: { id: "orders", clientId: "vuu-orders" },
        role: { id: "read", name: "read" },
      },
      {
        group: { id: "traders", name: "Traders", path: "/vuu/orders/traders" },
        client: { id: "orders", clientId: "vuu-orders" },
        role: { id: "trade", name: "trade" },
      },
    ],
    timestamp: 123,
  } satisfies KeycloakAdminSnapshot;

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

  test("flattens Keycloak nested groups into the groups read model", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/token")) {
        return new Response(JSON.stringify({ access_token: "test-token" }), { status: 200 });
      }
      if (url.endsWith("/admin/realms/vuu")) {
        return new Response(JSON.stringify({ realm: "vuu", enabled: true }), { status: 200 });
      }
      if (url.includes("/groups?")) {
        return new Response(
          JSON.stringify([{ id: "vuu", name: "vuu", path: "/vuu" }]),
          { status: 200 },
        );
      }
      if (url.includes("/groups/vuu/children?")) {
        return new Response(
          JSON.stringify([{ id: "basket", name: "basket-trading", path: "/vuu/basket-trading" }]),
          { status: 200 },
        );
      }
      if (url.includes("/groups/basket/children?")) {
        return new Response(
          JSON.stringify([{ id: "users", name: "users", path: "/vuu/basket-trading/users" }]),
          { status: 200 },
        );
      }
      if (url.includes("/groups/users/children?")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      throw new Error(`Unexpected mocked URL ${url}`);
    }) as typeof fetch;

    try {
      process.env.VUU_CONFIG_FILE = "packages/vuu-user-admin/application.conf";
      const client = await KeycloakAdminClient.createFromConfig();
      const groups = await client.listGroups();
      expect(groups.map(({ id, name, path, parentId }) => ({
        id,
        name,
        path,
        parentId,
      }))).toEqual([
        { id: "vuu", name: "vuu", path: "/vuu", parentId: undefined },
        { id: "basket", name: "basket-trading", path: "/vuu/basket-trading", parentId: "vuu" },
        {
          id: "users",
          name: "users",
          path: "/vuu/basket-trading/users",
          parentId: "basket",
        },
      ]);

      const rows: unknown[][] = [];
      new KeycloakGroupsProvider({
        indexOfKeyField: 0,
        rows,
        upsert: (row: unknown[]) => rows.push(row),
        delete: () => undefined,
        rowIndexAtKey: () => -1,
      } as never).loadSnapshot({
        realm: { realm: "vuu" },
        users: [],
        groups,
        clients: [],
        clientRoles: [],
        userGroups: [],
        groupRoles: [],
        timestamp: 123,
      });
      expect(rows).toEqual([[
        "users",
        "/vuu/basket-trading/users",
        "basket",
        0,
        0,
        123,
        123,
        "",
      ]]);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.VUU_CONFIG_FILE;
      ConfigFactory.reset();
    }
  });

  test("loads only client roles from in-scope vuu clients", async () => {
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
      if (url.includes("/users?")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes("/groups?")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes("/clients/vuu-client-internal/roles?")) {
        return new Response(
          JSON.stringify([{ id: "role-1", name: "trader", clientRole: true }]),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected mocked URL ${url}`);
    }) as typeof fetch;

    try {
      process.env.VUU_CONFIG_FILE = "packages/vuu-user-admin/application.conf";
      const client = await KeycloakAdminClient.createFromConfig();
      const snapshot = await client.readSnapshot();
      expect(snapshot.clients.map(({ clientId }) => clientId)).toEqual(["vuu-orders"]);
      expect(snapshot.clientRoles).toEqual([{
        client: snapshot.clients[0],
        role: { id: "role-1", name: "trader", clientRole: true },
      }]);
      expect(snapshot.groupRoles).toEqual([]);
      await expect(
        client.listClientRoles({ id: "other-client-internal", clientId: "other-app" }),
      ).rejects.toThrow('Keycloak client identifier must start with "vuu-"');
      await expect(
        client.listClientRolesForGroup("group-1", {
          id: "other-client-internal",
          clientId: "other-app",
        }),
      ).rejects.toThrow('Keycloak client identifier must start with "vuu-"');
      expect(requests.some((url) => url.includes("/admin/realms/vuu/roles?"))).toBe(false);
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
      }],
      groups: [],
      clients: [],
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
      0,
      0,
      "",
      0,
      123,
      123,
      "",
    ]);
  });

  test("derives sorted module access from vuu-portal group access roles", () => {
    const user = { id: "u1", username: "alice" };
    const assignedGroup = { id: "g1", name: "portal-users" };
    const otherGroup = { id: "g2", name: "other-users" };
    const portalClient = { id: "portal-client", clientId: "vuu-portal" };
    const otherClient = { id: "orders-client", clientId: "vuu-orders" };
    const snapshot = {
      realm: { realm: "vuu" },
      users: [user],
      groups: [assignedGroup, otherGroup],
      clients: [portalClient, otherClient],
      clientRoles: [],
      userGroups: [
        { user, group: assignedGroup },
        { user, group: assignedGroup },
      ],
      groupRoles: [
        { group: assignedGroup, client: portalClient, role: { id: "z", name: "z-access" } },
        { group: assignedGroup, client: portalClient, role: { id: "a", name: "a-access" } },
        { group: assignedGroup, client: portalClient, role: { id: "a-2", name: "a-access" } },
        { group: assignedGroup, client: portalClient, role: { id: "user-admin", name: "user-admin-access" } },
        { group: assignedGroup, client: portalClient, role: { id: "read", name: "read" } },
        { group: assignedGroup, client: otherClient, role: { id: "orders", name: "orders-access" } },
        { group: otherGroup, client: portalClient, role: { id: "other", name: "other-access" } },
        { group: assignedGroup, role: { id: "realm", name: "realm-access" } },
      ],
      timestamp: 123,
    };

    expect(userModuleAccess(snapshot, user.id)).toEqual({
      roles: ["a-access", "user-admin-access", "z-access"],
      value: "a-access,user-admin-access,z-access",
      count: 3,
    });

    const rows: unknown[][] = [];
    const table = {
      indexOfKeyField: 0,
      rows,
      upsert: (row: unknown[]) => {
        const index = rows.findIndex(([key]) => key === row[0]);
        if (index === -1) rows.push(row);
        else rows[index] = row;
      },
      delete: (key: string) => {
        const index = rows.findIndex(([rowKey]) => rowKey === key);
        if (index !== -1) rows.splice(index, 1);
      },
      rowIndexAtKey: (key: string) => rows.findIndex(([rowKey]) => rowKey === key),
    };
    const provider = new KeycloakUsersProvider(table as never);
    provider.loadSnapshot(snapshot);
    expect(rows[0]?.[11]).toBe("a-access,user-admin-access,z-access");
    expect(rows[0]?.[12]).toBe(3);
    provider.loadSnapshot({ ...snapshot, groupRoles: [] });
    expect(rows[0]?.[11]).toBe("");
    expect(rows[0]?.[12]).toBe(0);
    provider.loadSnapshot({
      ...snapshot,
      users: [],
      userGroups: [],
      groupRoles: [],
    });
    expect(rows).toEqual([]);
  });

  test("excludes realm roles from role projections and counts", () => {
    const user = { id: "u1", username: "alice" };
    const group = { id: "g1", name: "traders" };
    const client = { id: "c1", clientId: "vuu-orders", name: "Orders" };
    const realmRole = { id: "realm-role", name: "default-roles-vuu" };
    const clientRole = { id: "client-role", name: "trader" };
    const snapshot = {
      realm: { realm: "vuu" },
      users: [user],
      groups: [group],
      clients: [client],
      clientRoles: [{ client, role: clientRole }],
      userGroups: [{ user, group }],
      groupRoles: [
        { group, role: realmRole },
        { group, role: clientRole, client },
      ],
      timestamp: 123,
    };
    const createTable = () => {
      const rows: unknown[][] = [];
      return {
        rows,
        table: {
          indexOfKeyField: 0,
          rows,
          upsert: (row: unknown[]) => rows.push(row),
          delete: () => undefined,
          rowIndexAtKey: () => -1,
        },
      };
    };

    const rolesTable = createTable();
    new KeycloakRolesProvider(rolesTable.table as never).loadSnapshot(snapshot);
    const groupRolesTable = createTable();
    new KeycloakGroupRolesProvider(groupRolesTable.table as never).loadSnapshot(snapshot);
    const userGroupRolesTable = createTable();
    new KeycloakUserGroupRolesProvider(userGroupRolesTable.table as never).loadSnapshot(snapshot);

    expect(rolesTable.rows).toHaveLength(1);
    expect(groupRolesTable.rows).toHaveLength(1);
    expect(userGroupRolesTable.rows).toHaveLength(1);
    expect(groupRoleCount(snapshot, group.id)).toBe(1);
    expect(userRoleCount(snapshot, user.id)).toBe(1);
  });

  test("uses each role's owning client for module access roles", () => {
    const portalClient = {
      id: "portal-client",
      clientId: "vuu-portal",
      name: "Portal",
    };
    const basketClient = {
      id: "basket-client",
      clientId: "vuu-basket-trading",
      name: "Basket Trading",
    };
    const snapshot = {
      realm: { realm: "vuu" },
      users: [],
      groups: [],
      clients: [portalClient, basketClient],
      clientRoles: [
        {
          client: basketClient,
          role: {
            id: "module-admin",
            name: "module-admin-access",
            containerId: portalClient.id,
          },
        },
        {
          client: basketClient,
          role: {
            id: "user-admin",
            name: "user-admin-access",
            containerId: portalClient.id,
          },
        },
        {
          client: basketClient,
          role: {
            id: "basket-trading",
            name: "basket-trading-access",
            containerId: portalClient.id,
          },
        },
        {
          client: basketClient,
          role: {
            id: "basket-read",
            name: "read",
            containerId: basketClient.id,
          },
        },
      ],
      userGroups: [],
      groupRoles: [],
      timestamp: 123,
    } satisfies KeycloakAdminSnapshot;
    const rows: unknown[][] = [];
    const table = {
      indexOfKeyField: 0,
      rows,
      upsert: (row: unknown[]) => rows.push(row),
      delete: () => undefined,
      rowIndexAtKey: () => -1,
    };

    new KeycloakRolesProvider(table as never).loadSnapshot(snapshot);

    expect(
      rows.map((row) => ({
        roleName: row[1],
        clientIdentifier: row[3],
        clientName: row[4],
      })),
    ).toEqual([
      {
        roleName: "module-admin-access",
        clientIdentifier: "vuu-portal",
        clientName: "Portal",
      },
      {
        roleName: "user-admin-access",
        clientIdentifier: "vuu-portal",
        clientName: "Portal",
      },
      {
        roleName: "basket-trading-access",
        clientIdentifier: "vuu-portal",
        clientName: "Portal",
      },
      {
        roleName: "read",
        clientIdentifier: "vuu-basket-trading",
        clientName: "Basket Trading",
      },
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

  test("returns module access options with the user's selected group", async () => {
    const client = {
      getUserModuleAccessOptions: async () => ({
        modules: [{
          clientIdentifier: "vuu-portal",
          loginRole: "orders-access",
          selectedGroupId: "users",
          groups: [{
            groupId: "users",
            groupName: "Users",
            groupPath: "/vuu/orders/users",
            roleId: "orders-access",
            roleName: "orders-access",
            privilege: "read",
            isDefault: true,
          }],
        }],
      }),
    };
    const service = new KeycloakAdminService(
      {} as never,
      async () => client as never,
      async () => undefined,
    );
    const result = await service.processRpcRequest("getUserModuleAccessOptions", {
      namedParams: { userId: "u1" },
      viewport: {} as never,
      ctx: {} as never,
    });
    expect(result).toEqual({
      type: "SUCCESS_RESULT",
      data: await client.getUserModuleAccessOptions(),
    });
  });

  test("builds module options from portal access-bearing groups", () => {
    expect(buildUserModuleAccessOptions(moduleAccessSnapshot, "u1")).toEqual({
      modules: [{
        clientIdentifier: "vuu-portal",
        loginRole: "orders-access",
        selectedGroupId: "users",
        groups: [
          {
            groupId: "traders",
            groupName: "Traders",
            groupPath: "/vuu/orders/traders",
            roleId: "orders-access",
            roleName: "orders-access",
            privilege: "trade",
            isDefault: false,
          },
          {
            groupId: "users",
            groupName: "Users",
            groupPath: "/vuu/orders/users",
            roleId: "orders-access",
            roleName: "orders-access",
            privilege: "read",
            isDefault: true,
          },
        ],
      }],
    });
  });

  test("reconciles a module assignment while preserving unrelated groups", async () => {
    const assignments: Array<{ userId: string; assignments: unknown[] }> = [];
    const client = {
      setUserModuleAccess: async (userId: string, next: unknown[]) => {
        assignments.push({ userId, assignments: next });
      },
    };
    const service = new KeycloakAdminService(
      {} as never,
      async () => client as never,
      async () => undefined,
    );
    const result = await service.processRpcRequest("setUserModuleAccess", {
      namedParams: {
        userId: "u1",
        assignments: JSON.stringify([{ loginRole: "orders-access", groupId: "traders" }]),
      },
      viewport: {} as never,
      ctx: {} as never,
    });
    expect(result).toEqual({ type: "SUCCESS_RESULT", data: undefined });
    expect(assignments).toEqual([{
      userId: "u1",
      assignments: [{ loginRole: "orders-access", groupId: "traders" }],
    }]);
  });

  test("plans removal of module groups without removing unrelated groups", () => {
    expect(
      planUserModuleAccessChanges(moduleAccessSnapshot, "u1", []),
    ).toEqual({
      addGroupIds: [],
      removeGroupIds: ["users"],
    });
    expect(() =>
      planUserModuleAccessChanges(moduleAccessSnapshot, "missing", []),
    ).toThrow("Keycloak user not found: missing");
  });

  test("rejects invalid module assignments before creating a Keycloak client", async () => {
    const service = new KeycloakAdminService(
      {} as never,
      async () => {
        throw new Error("client should not be created");
      },
      async () => undefined,
    );
    const invalidAssignments = [
      "not-json",
      JSON.stringify([{ loginRole: "unknown-access", groupId: "users" }]),
      JSON.stringify([{ loginRole: "orders-access", groupId: "missing" }]),
    ];
    for (const assignments of invalidAssignments) {
      const result = await service.processRpcRequest("setUserModuleAccess", {
        namedParams: { userId: "u1", assignments },
        viewport: {} as never,
        ctx: {} as never,
      });
      expect(result.type).toBe("ERROR_RESULT");
    }
  });

  test("rejects unknown module and group assignments", () => {
    expect(() =>
      planUserModuleAccessChanges(moduleAccessSnapshot, "u1", [{
        loginRole: "unknown-access",
        groupId: "users",
      }]),
    ).toThrow("Unknown module access role: unknown-access");
    expect(() =>
      planUserModuleAccessChanges(moduleAccessSnapshot, "u1", [{
        loginRole: "orders-access",
        groupId: "missing",
      }]),
    ).toThrow("Keycloak group not found: missing");
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
    expect(KEYCLOAK_ADMIN_RPC_CONTRACT.getUserModuleAccessOptions).toEqual(["userId"]);
    expect(KEYCLOAK_ADMIN_RPC_CONTRACT.setUserModuleAccess).toEqual([
      "userId",
      "assignments",
    ]);
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
