export const CLIENT_ROLES = {
  "vuu-portal": [
    "module-admin-login",
    "user-admin-login",
    "basket-trading-login",
  ],
  "vuu-portal-server": ["modules.view", "modules.edit"],
  "vuu-module-admin-server": ["module-admin-view", "module-admin-edit"],
  "vuu-user-admin-server": [
    "users.view",
    "users.admin",
    "user-admin-view",
    "user-admin-edit",
  ],
  "vuu-basket-trading-server": [
    "basket.view",
    "basket.trade",
    "basket-trading-view",
    "basket-trading-trade",
  ],
} as const;

export type ClientId = keyof typeof CLIENT_ROLES;

export type ClientRoleRef = {
  clientId: ClientId;
  roleName: string;
};

export const GROUP_ROLES: Record<string, readonly ClientRoleRef[]> = {
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
};

export const SEEDED_USERS = [
  { username: "trader1", email: "trader1@vuu.com", groups: ["BASKET_TRADE"] },
  { username: "trader2", email: "trader2@vuu.com", groups: ["BASKET_TRADE"] },
  {
    username: "admin",
    email: "admin@vuu.com",
    groups: ["MODULES_ADMIN", "USERS_ADMIN", "BASKET_TRADE"],
  },
] as const;
