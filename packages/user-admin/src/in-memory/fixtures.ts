import type { UserAdminSnapshot } from "../contracts/UserAdminTypes";

const portalClient = { id: "portal-client", clientId: "vuu-portal" };

const roleNames = [
  "user-admin-access",
  "user-admin-admin",
  "module-admin-access",
  "module-admin-admin",
  "basket-trading-access",
  "basket-trading-trade",
] as const;

const roleByName = new Map(
  roleNames.map((name) => [name, {
    id: name,
    name,
    clientRole: true,
    containerId: portalClient.id,
  }]),
);

const groupDefinitions = [
  ["group-user-admin-read", "group-user-admin-read", "user-admin-access", true],
  ["group-user-admin-admin", "group-user-admin-admin", "user-admin-access", false],
  ["group-module-admin-read", "group-module-admin-read", "module-admin-access", true],
  ["group-module-admin-admin", "group-module-admin-admin", "module-admin-access", false],
  ["group-basket-trading-read", "group-basket-trading-read", "basket-trading-access", true],
  ["group-basket-trading-trade", "group-basket-trading-trade", "basket-trading-access", false],
] as const;

export const createUserAdminModuleAccessFixture = (): Partial<UserAdminSnapshot> => {
  const groups = groupDefinitions.map(([id, name, defaultRole, isDefault]) => ({
    id,
    name,
    path: `/${id}`,
    ...(isDefault ? { moduleAccessDefaultRoles: [defaultRole] } : {}),
  }));
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const groupRoleDefinitions = [
    ["group-user-admin-read", ["user-admin-access"]],
    ["group-user-admin-admin", ["user-admin-access", "user-admin-admin"]],
    ["group-module-admin-read", ["module-admin-access"]],
    ["group-module-admin-admin", ["module-admin-access", "module-admin-admin"]],
    ["group-basket-trading-read", ["basket-trading-access"]],
    ["group-basket-trading-trade", ["basket-trading-access", "basket-trading-trade"]],
  ] as const;

  return {
    users: [],
    groups,
    clients: [portalClient],
    clientRoles: roleNames.map((name) => ({
      client: portalClient,
      role: roleByName.get(name)!,
    })),
    userGroups: [],
    groupRoles: groupRoleDefinitions.flatMap(([groupId, names]) =>
      names.map((name) => ({
        group: groupById.get(groupId)!,
        client: portalClient,
        role: roleByName.get(name)!,
      })),
    ),
    timestamp: 0,
  };
};
