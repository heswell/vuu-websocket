export const CLIENT_ROLES = {
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
} as const;

export type ClientId = keyof typeof CLIENT_ROLES;

export const RETIRED_CLIENT_ROLES: Record<ClientId, readonly string[]> = {
  "vuu-portal": [],
  "vuu-portal-server": ["modules.view", "modules.edit"],
  "vuu-module-admin": [],
  "vuu-user-admin": ["user-admin-view", "user-admin-edit", "users.view", "users.admin"],
  "vuu-basket-trading": [
    "basket-trading-view",
    "basket-trading-trade",
    "basket.view",
    "basket.trade",
  ],
  "vuu-table-browser": [],
  "vuu-table-viewer": [],
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
  "vuu-module-admin": allManagedRoleNames,
  "vuu-user-admin": allManagedRoleNames,
  "vuu-basket-trading": allManagedRoleNames,
  "vuu-table-browser": allManagedRoleNames,
  "vuu-table-viewer": allManagedRoleNames,
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

/**
 * Each group is named `<app>-<suffix>`, where `<app>-` is its application's
 * access role without `-access`. User Admin matches a group to its
 * application by the last segment of the group's path, so the parent `/vuu`
 * group only keeps them together in the Keycloak console.
 */
export const GROUP_ROLES: Record<string, readonly ClientRoleRef[]> = {
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
};

/**
 * Groups from the earlier `/vuu/<app>/<suffix>` layout. Deleting a parent
 * deletes the groups under it.
 */
export const RETIRED_GROUP_PATHS = [
  "/vuu/user-admin",
  "/vuu/basket-trading",
  "/vuu/module-admin",
  "/vuu/table-browser",
] as const;

export const RETIRED_GROUP_NAMES = [
  "MODULES_VIEW",
  "MODULES_ADMIN",
  "USERS_VIEW",
  "USERS_ADMIN",
  "BASKET_VIEW",
  "BASKET_TRADE",
] as const;

export interface SeededUser {
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  groups: readonly string[];
}

const sampleUser = (
  firstName: string,
  lastName: string,
  groups: readonly string[] = [],
): SeededUser => {
  const username = `${firstName[0]}${lastName}`.toLowerCase();
  return {
    username,
    email: `${username}@vuu.com`,
    firstName,
    lastName,
    groups,
  };
};

export const SEEDED_USERS: readonly SeededUser[] = [
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
  // Sample users for trying out User Admin: a mix of access, and none.
  sampleUser("Oliver", "Bennett", ["/vuu/basket-trading-read"]),
  sampleUser("Amelia", "Hughes", [
    "/vuu/basket-trading-read",
    "/vuu/vuu-table-browser-read",
  ]),
  sampleUser("Harry", "Clarke", ["/vuu/basket-trading-trade"]),
  sampleUser("Isla", "Turner"),
  sampleUser("George", "Fletcher"),
  sampleUser("Poppy", "Hargreaves", ["/vuu/user-admin-read"]),
  sampleUser("Alfie", "Dawson"),
  sampleUser("Freya", "Whitaker", ["/vuu/vuu-table-viewer-read"]),
  sampleUser("Jack", "Pemberton"),
  sampleUser("Matilda", "Ashworth", [
    "/vuu/basket-trading-read",
    "/vuu/module-admin-read",
  ]),
  sampleUser("Thomas", "Holloway"),
  sampleUser("Lucy", "Carrington", ["/vuu/vuu-table-browser-read"]),
];
