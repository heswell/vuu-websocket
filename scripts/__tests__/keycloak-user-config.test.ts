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
  test("owns navigation roles on the public portal client", () => {
    expect(CLIENT_ROLES["vuu-portal"]).toEqual([
      "module-admin-login",
      "user-admin-login",
      "basket-trading-login",
    ]);
    expect(CLIENT_ROLES["vuu-portal-server"]).toEqual([]);
    expect(CLIENT_ROLES["vuu-module-admin-server"]).toEqual([
      "module-admin-view",
      "module-admin-edit",
    ]);
    expect(CLIENT_ROLES["vuu-user-admin-server"]).toEqual([
      "user-admin-view",
      "user-admin-edit",
    ]);
    expect(CLIENT_ROLES["vuu-basket-trading-server"]).toEqual([
      "basket-trading-view",
      "basket-trading-trade",
    ]);
  });

  test("assigns independent login and resource roles to each group", () => {
    expect(GROUP_ROLES).toEqual({
      MODULES_VIEW: [
        { clientId: "vuu-portal", roleName: "module-admin-login" },
        { clientId: "vuu-module-admin-server", roleName: "module-admin-view" },
      ],
      MODULES_ADMIN: [
        { clientId: "vuu-portal", roleName: "module-admin-login" },
        { clientId: "vuu-module-admin-server", roleName: "module-admin-view" },
        { clientId: "vuu-module-admin-server", roleName: "module-admin-edit" },
      ],
      USERS_VIEW: [
        { clientId: "vuu-portal", roleName: "user-admin-login" },
        { clientId: "vuu-user-admin-server", roleName: "user-admin-view" },
      ],
      USERS_ADMIN: [
        { clientId: "vuu-portal", roleName: "user-admin-login" },
        { clientId: "vuu-user-admin-server", roleName: "user-admin-view" },
        { clientId: "vuu-user-admin-server", roleName: "user-admin-edit" },
      ],
      BASKET_VIEW: [
        { clientId: "vuu-portal", roleName: "basket-trading-login" },
        {
          clientId: "vuu-basket-trading-server",
          roleName: "basket-trading-view",
        },
      ],
      BASKET_TRADE: [
        { clientId: "vuu-portal", roleName: "basket-trading-login" },
        {
          clientId: "vuu-basket-trading-server",
          roleName: "basket-trading-view",
        },
        {
          clientId: "vuu-basket-trading-server",
          roleName: "basket-trading-trade",
        },
      ],
    });
  });

  test("declares only target-owned resource roles and tracks legacy roles", () => {
    expect(RETIRED_CLIENT_ROLES).toEqual({
      "vuu-portal": [],
      "vuu-portal-server": ["modules.view", "modules.edit"],
      "vuu-module-admin-server": [],
      "vuu-user-admin-server": ["users.view", "users.admin"],
      "vuu-basket-trading-server": ["basket.view", "basket.trade"],
    });
    expect(MANAGED_CLIENT_ROLE_NAMES["vuu-user-admin-server"]).toContain(
      "module-admin-edit",
    );
    expect(MANAGED_CLIENT_ROLE_NAMES["vuu-user-admin-server"]).toContain(
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

  test("removes stale managed cross-client scopes but retains custom roles", () => {
    const current = [
      { id: "stale-cross-client", name: "user-admin-view" },
      { id: "legacy", name: "users.admin" },
      { id: "administrator", name: "reporting.export" },
    ];

    expect(
      planManagedRoleScopeChanges(
        current,
        [],
        MANAGED_CLIENT_ROLE_NAMES["vuu-user-admin-server"],
      ),
    ).toEqual({
      add: [],
      remove: current.slice(0, 2),
    });
  });

  test("reconciles target-only role scopes idempotently", () => {
    const desired = CLIENT_ROLES["vuu-module-admin-server"];
    const managed = MANAGED_CLIENT_ROLE_NAMES["vuu-module-admin-server"];
    const once = planManagedRoleScopeChanges(
      [{ id: "view", name: "module-admin-view" }],
      desired,
      managed,
    );
    expect(once).toEqual({
      add: ["module-admin-edit"],
      remove: [],
    });

    expect(
      planManagedRoleScopeChanges(
        [
          { id: "view", name: "module-admin-view" },
          { id: "edit", name: "module-admin-edit" },
          { id: "custom", name: "administrator.custom" },
        ],
        desired,
        managed,
      ),
    ).toEqual({ add: [], remove: [] });
  });

  test("reconciles managed groups by id and preserves same-name custom groups", () => {
    const desired = [{ id: "managed-users-admin", name: "USERS_ADMIN" }];
    const customSameName = [{ id: "custom-subgroup", name: "USERS_ADMIN" }];

    expect(planManagedIdChanges(customSameName, desired, desired)).toEqual({
      add: ["managed-users-admin"],
      remove: [],
    });
    expect(
      planManagedIdChanges([...customSameName, ...desired], desired, desired),
    ).toEqual({ add: [], remove: [] });
  });

  test("keeps portal navigation roles and excludes all resource roles", () => {
    expect(CLIENT_ROLES["vuu-portal"]).toEqual([
      "module-admin-login",
      "user-admin-login",
      "basket-trading-login",
    ]);
    const remoteRoles = new Set<string>(
      Object.entries(CLIENT_ROLES)
        .filter(([clientId]) => clientId !== "vuu-portal")
        .flatMap(([, roles]) => roles),
    );
    expect(
      CLIENT_ROLES["vuu-portal"].filter((role) => remoteRoles.has(role)),
    ).toEqual([]);
  });

  test("preserves seeded-user group intent", () => {
    expect(SEEDED_USERS).toEqual([
      {
        username: "trader1",
        email: "trader1@vuu.com",
        groups: ["BASKET_TRADE"],
      },
      {
        username: "trader2",
        email: "trader2@vuu.com",
        groups: ["BASKET_TRADE"],
      },
      {
        username: "admin",
        email: "admin@vuu.com",
        groups: ["MODULES_ADMIN", "USERS_ADMIN", "BASKET_TRADE"],
      },
    ]);
  });
});
