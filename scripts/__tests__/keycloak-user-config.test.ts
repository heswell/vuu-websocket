import { describe, expect, test } from "bun:test";
import {
  CLIENT_ROLES,
  GROUP_ROLES,
  SEEDED_USERS,
} from "../keycloak-user-config";

describe("Keycloak user and role configuration", () => {
  test("owns navigation roles on the public portal client", () => {
    expect(CLIENT_ROLES["vuu-portal"]).toEqual([
      "module-admin-login",
      "user-admin-login",
      "basket-trading-login",
    ]);
    expect(CLIENT_ROLES["vuu-portal-server"]).toEqual([
      "modules.view",
      "modules.edit",
    ]);
    expect(CLIENT_ROLES["vuu-module-admin-server"]).toEqual([
      "module-admin-view",
      "module-admin-edit",
    ]);
    expect(CLIENT_ROLES["vuu-user-admin-server"]).toEqual([
      "users.view",
      "users.admin",
      "user-admin-view",
      "user-admin-edit",
    ]);
    expect(CLIENT_ROLES["vuu-basket-trading-server"]).toEqual([
      "basket.view",
      "basket.trade",
      "basket-trading-view",
      "basket-trading-trade",
    ]);
  });

  test("assigns independent login and resource roles to each group", () => {
    expect(GROUP_ROLES).toEqual({
      MODULES_VIEW: [
        { clientId: "vuu-portal", roleName: "module-admin-login" },
        { clientId: "vuu-portal-server", roleName: "modules.view" },
        { clientId: "vuu-module-admin-server", roleName: "module-admin-view" },
      ],
      MODULES_ADMIN: [
        { clientId: "vuu-portal", roleName: "module-admin-login" },
        { clientId: "vuu-portal-server", roleName: "modules.view" },
        { clientId: "vuu-portal-server", roleName: "modules.edit" },
        { clientId: "vuu-module-admin-server", roleName: "module-admin-view" },
        { clientId: "vuu-module-admin-server", roleName: "module-admin-edit" },
      ],
      USERS_VIEW: [
        { clientId: "vuu-portal", roleName: "user-admin-login" },
        { clientId: "vuu-user-admin-server", roleName: "users.view" },
        { clientId: "vuu-user-admin-server", roleName: "user-admin-view" },
      ],
      USERS_ADMIN: [
        { clientId: "vuu-portal", roleName: "user-admin-login" },
        { clientId: "vuu-user-admin-server", roleName: "users.view" },
        { clientId: "vuu-user-admin-server", roleName: "users.admin" },
        { clientId: "vuu-user-admin-server", roleName: "user-admin-view" },
        { clientId: "vuu-user-admin-server", roleName: "user-admin-edit" },
      ],
      BASKET_VIEW: [
        { clientId: "vuu-portal", roleName: "basket-trading-login" },
        {
          clientId: "vuu-basket-trading-server",
          roleName: "basket.view",
        },
        {
          clientId: "vuu-basket-trading-server",
          roleName: "basket-trading-view",
        },
      ],
      BASKET_TRADE: [
        { clientId: "vuu-portal", roleName: "basket-trading-login" },
        {
          clientId: "vuu-basket-trading-server",
          roleName: "basket.view",
        },
        {
          clientId: "vuu-basket-trading-server",
          roleName: "basket.trade",
        },
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
