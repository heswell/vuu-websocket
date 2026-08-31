export const CLIENT_ROLES = {
  "vuu-portal": [
    "module-admin-login",
    "user-admin-login",
    "basket-trading-login",
  ],
  "vuu-portal-server": [],
  "vuu-module-admin-server": ["module-admin-view", "module-admin-edit"],
  "vuu-user-admin-server": ["user-admin-view", "user-admin-edit"],
  "vuu-basket-trading-server": [
    "basket-trading-view",
    "basket-trading-trade",
  ],
} as const;

export type ClientId = keyof typeof CLIENT_ROLES;

export const RETIRED_CLIENT_ROLES: Record<ClientId, readonly string[]> = {
  "vuu-portal": [],
  "vuu-portal-server": ["modules.view", "modules.edit"],
  "vuu-module-admin-server": [],
  "vuu-user-admin-server": ["users.view", "users.admin"],
  "vuu-basket-trading-server": ["basket.view", "basket.trade"],
};

const allManagedRoleNames = [
  ...new Set([
    ...Object.values(CLIENT_ROLES).flat(),
    ...Object.values(RETIRED_CLIENT_ROLES).flat(),
  ]),
];

export const MANAGED_CLIENT_ROLE_NAMES = {
  "vuu-portal": allManagedRoleNames,
  "vuu-portal-server": allManagedRoleNames,
  "vuu-module-admin-server": allManagedRoleNames,
  "vuu-user-admin-server": allManagedRoleNames,
  "vuu-basket-trading-server": allManagedRoleNames,
} satisfies Record<ClientId, readonly string[]>;

export type RoleScopeChange<T> = {
  add: string[];
  remove: T[];
};

export function planManagedRoleScopeChanges<T extends { name: string }>(
  currentRoles: readonly T[],
  desiredRoleNames: readonly string[],
  managedRoleNames: readonly string[],
): RoleScopeChange<T> {
  const desired = new Set(desiredRoleNames);
  const managed = new Set(managedRoleNames);
  const currentByName = new Map(currentRoles.map((role) => [role.name, role]));

  return {
    add: desiredRoleNames.filter((name) => !currentByName.has(name)),
    remove: currentRoles.filter(
      ({ name }) => managed.has(name) && !desired.has(name),
    ),
  };
}

export type ClientRoleRef = {
  clientId: ClientId;
  roleName: string;
};

export const GROUP_ROLES: Record<string, readonly ClientRoleRef[]> = {
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
