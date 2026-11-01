import type { UserAdminSnapshot } from "../contracts/UserAdminTypes";

const clients = {
  portal: { id: "portal-client", clientId: "vuu-portal" },
  userAdmin: { id: "user-admin-client", clientId: "vuu-user-admin" },
  portalServer: { id: "portal-server-client", clientId: "vuu-portal-server" },
  basketTrading: { id: "basket-trading-client", clientId: "vuu-basket-trading" },
} as const;

const roleDefinitions = [
  [clients.portal, "user-admin-access", "access"],
  [clients.portal, "module-admin-access", "access"],
  [clients.portal, "basket-trading-access", "access"],
  [clients.userAdmin, "read", "read"],
  [clients.userAdmin, "admin", "admin"],
  [clients.portalServer, "module-admin-read", "read"],
  [clients.portalServer, "module-admin-admin", "admin"],
  [clients.basketTrading, "read", "read"],
  [clients.basketTrading, "trade", "trade"],
] as const;

const roleByClientAndName = new Map(
  roleDefinitions.map(([client, name, roleDisplayName]) => [`${client.id}:${name}`, {
    id: `${client.id}:${name}`,
    name,
    roleDisplayName,
    clientRole: true,
    containerId: client.id,
  }]),
);

const groupDefinitions = [
  { id: "group-user-admin-read", groupDisplayName: "read", accessRole: "user-admin-access", isDefault: true },
  { id: "group-user-admin-admin", groupDisplayName: "admin", accessRole: "user-admin-access", isDefault: false },
  { id: "group-module-admin-read", groupDisplayName: "read", accessRole: "module-admin-access", isDefault: true },
  { id: "group-module-admin-admin", groupDisplayName: "admin", accessRole: "module-admin-access", isDefault: false },
  { id: "group-basket-trading-read", groupDisplayName: "read", accessRole: "basket-trading-access", isDefault: true },
  { id: "group-basket-trading-trade", groupDisplayName: "trade", accessRole: "basket-trading-access", isDefault: false },
] as const;

export const createUserAdminModuleAccessFixture = (): Partial<UserAdminSnapshot> => {
  const groups = groupDefinitions.map(({ id, groupDisplayName, accessRole, isDefault }) => ({
    id,
    name: id,
    groupDisplayName,
    path: `/${id}`,
    ...(isDefault ? { moduleAccessDefaultRoles: [accessRole] } : {}),
  }));
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const groupRoleDefinitions = [
    ["group-user-admin-read", [[clients.portal, "user-admin-access"], [clients.userAdmin, "read"]]],
    ["group-user-admin-admin", [[clients.portal, "user-admin-access"], [clients.userAdmin, "read"], [clients.userAdmin, "admin"]]],
    ["group-module-admin-read", [[clients.portal, "module-admin-access"], [clients.portalServer, "module-admin-read"]]],
    ["group-module-admin-admin", [[clients.portal, "module-admin-access"], [clients.portalServer, "module-admin-read"], [clients.portalServer, "module-admin-admin"]]],
    ["group-basket-trading-read", [[clients.portal, "basket-trading-access"], [clients.basketTrading, "read"]]],
    ["group-basket-trading-trade", [[clients.portal, "basket-trading-access"], [clients.basketTrading, "read"], [clients.basketTrading, "trade"]]],
  ] as const;

  return {
    users: [],
    groups,
    clients: Object.values(clients),
    clientRoles: roleDefinitions.map(([client, name]) => ({
      client,
      role: roleByClientAndName.get(`${client.id}:${name}`)!,
    })),
    userGroups: [],
    groupRoles: groupRoleDefinitions.flatMap(([groupId, roles]) =>
      roles.map(([client, name]) => ({
        group: groupById.get(groupId)!,
        client,
        role: roleByClientAndName.get(`${client.id}:${name}`)!,
      })),
    ),
    timestamp: 0,
  };
};
