import { describe, expect, test } from "bun:test";
import {
  CLIENT_ROLES,
  GROUP_ROLES,
  MANAGED_CLIENT_ROLE_NAMES,
  planManagedIdChanges,
  planManagedRoleScopeChanges,
  RETIRED_CLIENT_ROLES,
  RETIRED_GROUP_PATHS,
  RETIRED_REALM_ROLE_NAMES,
  SEEDED_USERS,
} from "../keycloak-user-config";
import { APPLICATION_CLIENT_NAMES } from "../keycloak-client-config";

/** Each application's access role and its own client, as the portal derives them. */
const APPLICATIONS = [
  { accessRole: "module-admin-access", client: "vuu-module-admin" },
  { accessRole: "user-admin-access", client: "vuu-user-admin" },
  { accessRole: "basket-trading-access", client: "vuu-basket-trading" },
  { accessRole: "vuu-table-browser-access", client: "vuu-table-browser" },
  { accessRole: "vuu-table-viewer-access", client: "vuu-table-viewer" },
];

describe("Keycloak user and role configuration", () => {
  test("assigns roles to the requested owning clients", () => {
    expect(CLIENT_ROLES).toEqual({
      "vuu-portal": [
        "user-admin-access",
        "basket-trading-access",
        "module-admin-access",
        "vuu-table-browser-access",
        "vuu-table-viewer-access",
      ],
      "vuu-portal-server": [],
      "vuu-module-admin": ["module-admin-read", "module-admin-admin"],
      "vuu-user-admin": ["read", "admin"],
      "vuu-basket-trading": ["read", "trade"],
      "vuu-table-browser": [],
      "vuu-table-viewer": [],
    });
  });

  test("maps each group to its application's roles", () => {
    expect(GROUP_ROLES).toEqual({
      "/vuu/user-admin-read": [
        { clientId: "vuu-portal", roleName: "user-admin-access" },
        { clientId: "vuu-user-admin", roleName: "read" },
      ],
      "/vuu/user-admin-admin": [
        { clientId: "vuu-portal", roleName: "user-admin-access" },
        { clientId: "vuu-user-admin", roleName: "read" },
        { clientId: "vuu-user-admin", roleName: "admin" },
      ],
      "/vuu/basket-trading-read": [
        { clientId: "vuu-portal", roleName: "basket-trading-access" },
        { clientId: "vuu-basket-trading", roleName: "read" },
      ],
      "/vuu/basket-trading-trade": [
        { clientId: "vuu-portal", roleName: "basket-trading-access" },
        { clientId: "vuu-basket-trading", roleName: "read" },
        { clientId: "vuu-basket-trading", roleName: "trade" },
      ],
      "/vuu/module-admin-read": [
        { clientId: "vuu-portal", roleName: "module-admin-access" },
        { clientId: "vuu-module-admin", roleName: "module-admin-read" },
      ],
      "/vuu/module-admin-admin": [
        { clientId: "vuu-portal", roleName: "module-admin-access" },
        { clientId: "vuu-module-admin", roleName: "module-admin-read" },
        { clientId: "vuu-module-admin", roleName: "module-admin-admin" },
      ],
      "/vuu/vuu-table-browser-read": [
        { clientId: "vuu-portal", roleName: "vuu-table-browser-access" },
      ],
      "/vuu/vuu-table-viewer-read": [
        { clientId: "vuu-portal", roleName: "vuu-table-viewer-access" },
      ],
    });
  });

  test("follows the User Admin naming conventions", () => {
    for (const { accessRole, client } of APPLICATIONS) {
      expect(CLIENT_ROLES["vuu-portal"]).toContain(accessRole);
      expect(CLIENT_ROLES).toHaveProperty(client);
    }
    expect(Object.keys(CLIENT_ROLES).every((id) => id.startsWith("vuu-"))).toBe(
      true,
    );
    for (const clientId of APPLICATION_CLIENT_NAMES) {
      expect(CLIENT_ROLES).toHaveProperty(clientId);
    }

    for (const [path, roles] of Object.entries(GROUP_ROLES)) {
      const name = path.split("/").at(-1)!;
      const accessRoles = roles.filter(({ clientId }) => clientId === "vuu-portal");
      // Exactly one application per group: its access role, named by prefix.
      expect(accessRoles).toHaveLength(1);
      const application = APPLICATIONS.find(
        ({ accessRole }) => accessRole === accessRoles[0].roleName,
      )!;
      const prefix = application.accessRole.replace(/-access$/, "-");
      expect(name.startsWith(prefix) && name.length > prefix.length).toBe(true);
      expect(name).not.toMatch(/[\s/]/);
      // Any other roles come from the application's own client.
      for (const { clientId } of roles) {
        expect([ "vuu-portal", application.client ]).toContain(clientId);
      }
    }

    // Every application role is granted by some group.
    for (const { client } of APPLICATIONS) {
      const roleNames = (CLIENT_ROLES as Record<string, readonly string[]>)[client];
      for (const roleName of roleNames) {
        expect(
          Object.values(GROUP_ROLES).some((roles) =>
            roles.some((role) => role.clientId === client && role.roleName === roleName),
          ),
        ).toBe(true);
      }
    }
  });

  test("retires the earlier nested group layout", () => {
    expect(RETIRED_GROUP_PATHS).toEqual([
      "/vuu/user-admin",
      "/vuu/basket-trading",
      "/vuu/module-admin",
      "/vuu/table-browser",
    ]);
    for (const path of Object.keys(GROUP_ROLES)) {
      expect(
        RETIRED_GROUP_PATHS.some(
          (retired) => path === retired || path.startsWith(`${retired}/`),
        ),
      ).toBe(false);
    }
  });

  test("tracks managed roles for cleanup", () => {
    expect(RETIRED_CLIENT_ROLES["vuu-portal"]).toEqual([]);
    expect(MANAGED_CLIENT_ROLE_NAMES["vuu-user-admin"]).toContain(
      "users.admin",
    );
    expect(RETIRED_REALM_ROLE_NAMES).toEqual([
      "modules.view",
      "modules.edit",
      "users.view",
      "users.admin",
      "basket.view",
      "basket.trade",
    ]);
  });

  test("removes stale managed scopes while retaining custom roles", () => {
    const current = [
      { id: "stale", name: "admin" },
      { id: "legacy", name: "users.admin" },
      { id: "custom", name: "reporting.export" },
    ];

    expect(
      planManagedRoleScopeChanges(
        current,
        [],
        MANAGED_CLIENT_ROLE_NAMES["vuu-user-admin"],
      ),
    ).toEqual({ add: [], remove: current.slice(0, 2) });
  });

  test("reconciles managed IDs idempotently", () => {
    const desired = [{ id: "managed", name: "group" }];
    const custom = [{ id: "custom", name: "group" }];

    expect(planManagedIdChanges(custom, desired, desired)).toEqual({
      add: ["managed"],
      remove: [],
    });
    expect(planManagedIdChanges([...custom, ...desired], desired, desired)).toEqual({
      add: [],
      remove: [],
    });
  });

  test("keeps seeded users and assigns them only to groups", () => {
    expect(SEEDED_USERS).toEqual([
      {
        username: "trader1",
        email: "trader1@vuu.com",
        groups: ["/vuu/basket-trading-trade"],
      },
      {
        username: "trader2",
        email: "trader2@vuu.com",
        groups: ["/vuu/basket-trading-trade"],
      },
      {
        username: "admin",
        email: "admin@vuu.com",
        groups: [
          "/vuu/module-admin-admin",
          "/vuu/user-admin-admin",
          "/vuu/basket-trading-trade",
          "/vuu/vuu-table-browser-read",
          "/vuu/vuu-table-viewer-read",
        ],
      },
    ]);
  });
});
