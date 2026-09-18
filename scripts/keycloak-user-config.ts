export const CLIENT_ROLES = {
  "vuu-portal": [
    "user-admin-access",
    "basket-trading-access",
    "module-admin-access",
    "vuu-table-browser-access",
    "vuu-table-viewer-access",
  ],
  "vuu-portal-server": ["module-admin-read", "module-admin-admin"],
  "vuu-user-admin": ["read", "admin"],
  "vuu-basket-trading": ["read", "trade"],
} as const;

export type ClientId = keyof typeof CLIENT_ROLES;

export const RETIRED_CLIENT_ROLES: Record<ClientId, readonly string[]> = {
  "vuu-portal": [],
  "vuu-portal-server": ["modules.view", "modules.edit"],
  "vuu-user-admin": ["user-admin-view", "user-admin-edit", "users.view", "users.admin"],
  "vuu-basket-trading": [
    "basket-trading-view",
    "basket-trading-trade",
    "basket.view",
    "basket.trade",
  ],
};

export const RETIRED_REALM_ROLE_NAMES = [
  "modules.view",
  "modules.edit",
  "users.view",
  "users.admin",
  "basket.view",
  "basket.trade",
] as const;

const allManagedRoleNames = [
  ...new Set([
    ...Object.values(CLIENT_ROLES).flat(),
    ...Object.values(RETIRED_CLIENT_ROLES).flat(),
  ]),
];

export const MANAGED_CLIENT_ROLE_NAMES = {
  "vuu-portal": allManagedRoleNames,
  "vuu-portal-server": allManagedRoleNames,
  "vuu-user-admin": allManagedRoleNames,
  "vuu-basket-trading": allManagedRoleNames,
} satisfies Record<ClientId, readonly string[]>;

export type RoleScopeChange<T> = {
  add: string[];
  remove: T[];
};

export function planManagedIdChanges<T extends { id: string }>(
  current: readonly T[],
  desired: readonly T[],
  managed: readonly T[],
): RoleScopeChange<T> {
  const currentIds = new Set(current.map(({ id }) => id));
  const desiredIds = new Set(desired.map(({ id }) => id));
  const managedIds = new Set(managed.map(({ id }) => id));

  return {
    add: desired.filter(({ id }) => !currentIds.has(id)).map(({ id }) => id),
    remove: current.filter(
      ({ id }) => managedIds.has(id) && !desiredIds.has(id),
    ),
  };
}

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
  "/vuu/table-browser/users": [
    { clientId: "vuu-portal", roleName: "vuu-table-browser-access" },
    { clientId: "vuu-portal", roleName: "vuu-table-viewer-access" },
  ],
};

export const RETIRED_GROUP_NAMES = [
  "MODULES_VIEW",
  "MODULES_ADMIN",
  "USERS_VIEW",
  "USERS_ADMIN",
  "BASKET_VIEW",
  "BASKET_TRADE",
] as const;

export const SEEDED_USERS = [
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
      "/vuu/table-browser/users",
    ],
  },
] as const;
