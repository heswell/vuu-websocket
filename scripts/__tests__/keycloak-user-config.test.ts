import { describe, expect, test } from "bun:test";
import {
  CLIENT_ROLES,
  GROUP_ROLES,
  MANAGED_CLIENT_ROLE_NAMES,
  planManagedIdChanges,
  planManagedRoleScopeChanges,
  RETIRED_CLIENT_ROLES,
  RETIRED_REALM_ROLE_NAMES,
  SEEDED_USERS,
} from "../keycloak-user-config";

describe("Keycloak user and role configuration", () => {
  test("assigns roles to the requested owning clients", () => {
    expect(CLIENT_ROLES).toEqual({
      "vuu-portal": [
        "user-admin-access",
        "basket-trading-access",
        "module-admin-access",
      ],
      "vuu-portal-server": ["module-admin-read", "module-admin-admin"],
      "vuu-user-admin": ["read", "admin"],
      "vuu-basket-trading": ["read", "trade"],
    });
  });

  test("maps the requested hierarchical groups to client roles", () => {
    expect(GROUP_ROLES).toEqual({
      "/vuu/user-admin/users": [
        { clientId: "vuu-portal", roleName: "user-admin-access" },
        { clientId: "vuu-user-admin", roleName: "read" },
      ],
      "/vuu/user-admin/administrators": [
        { clientId: "vuu-portal", roleName: "user-admin-access" },
        { clientId: "vuu-user-admin", roleName: "read" },
        { clientId: "vuu-user-admin", roleName: "admin" },
      ],
      "/vuu/basket-trading/users": [
        { clientId: "vuu-portal", roleName: "basket-trading-access" },
        { clientId: "vuu-basket-trading", roleName: "read" },
      ],
      "/vuu/basket-trading/traders": [
        { clientId: "vuu-portal", roleName: "basket-trading-access" },
        { clientId: "vuu-basket-trading", roleName: "read" },
        { clientId: "vuu-basket-trading", roleName: "trade" },
      ],
      "/vuu/module-admin/users": [
        { clientId: "vuu-portal", roleName: "module-admin-access" },
        { clientId: "vuu-portal-server", roleName: "module-admin-read" },
      ],
      "/vuu/module-admin/administrators": [
        { clientId: "vuu-portal", roleName: "module-admin-access" },
        { clientId: "vuu-portal-server", roleName: "module-admin-read" },
        { clientId: "vuu-portal-server", roleName: "module-admin-admin" },
      ],
    });
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
        groups: ["/vuu/basket-trading/traders"],
      },
      {
        username: "trader2",
        email: "trader2@vuu.com",
        groups: ["/vuu/basket-trading/traders"],
      },
      {
        username: "admin",
        email: "admin@vuu.com",
        groups: [
          "/vuu/module-admin/administrators",
          "/vuu/user-admin/administrators",
          "/vuu/basket-trading/traders",
        ],
      },
    ]);
  });
});
