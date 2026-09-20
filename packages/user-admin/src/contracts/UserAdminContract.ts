/**
 * The write-only fields in this contract are deliberately not table columns:
 * Identity providers never return a user's password and it must not be echoed
 * by VUU.
 */
export type UserMutationFields = {
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  emailVerified?: boolean;
  temporary_password?: string;
  group_ids?: string[];
};

export const VUU_CLIENT_ID_PREFIX = "vuu-";
export const VUU_PORTAL_CLIENT_IDENTIFIER = "vuu-portal";

export const isVuuClientId = (clientId: string) =>
  clientId.startsWith(VUU_CLIENT_ID_PREFIX);

export const assertVuuClientId = (clientId: string) => {
  if (!isVuuClientId(clientId)) {
    throw new Error(
      `Managed client identifier must start with "${VUU_CLIENT_ID_PREFIX}"`,
    );
  }
  return clientId;
};

export type AddUserRpcParams = {
  username: string;
} & UserMutationFields;

export type UpdateUserRpcParams = {
  userId: string;
} & UserMutationFields;

export type GroupRoleRpcParams = {
  groupId?: string;
  groupName?: string;
  roleId?: string;
  roleName?: string;
  /** Required for client-role assignments; omit for realm roles. */
  clientId?: string;
};

export type GetUserModuleAccessOptionsRpcParams = {
  userId: string;
};

export type UserModuleAccessAssignment = {
  accessRole: string;
  groupId: string;
};

export type UserModuleAccessPermission = {
  clientIdentifier: string;
  accessRole: string;
  groupIds: string[];
};

export type UserModuleAccessPermissions = UserModuleAccessPermission[];

export type SetUserModuleAccessRpcParams = {
  userId: string;
  /** JSON-encoded UserModuleAccessAssignment[]. */
  assignments: string;
};

export type UserModuleAccessGroup = {
  groupId: string;
  groupName: string;
  groupDisplayName: string;
  groupPath?: string;
  roleId: string;
  roleName: string;
  roleDisplayName: string;
  privilege?: string;
  isDefault: boolean;
};

/**
 * Access options expose every group that grants an application access role.
 * `isDefault` is supplied by the server-owned least-privilege policy.
 */
export type UserModuleAccessModule = {
  clientIdentifier: string;
  accessRole: string;
  groups: UserModuleAccessGroup[];
  selectedGroupIds: string[];
  /**
   * @deprecated Use selectedGroupIds. This is the first selected group for
   * clients that still consume the legacy singular field.
   */
  selectedGroupId?: string;
};

export type UserModuleAccessOptions = {
  modules: UserModuleAccessModule[];
};

export function normalizeUserModuleAccessPermissions(
  permissions: readonly UserModuleAccessPermission[],
): UserModuleAccessPermissions {
  const groupsByClient = new Map<string, Map<string, Set<string>>>();

  for (const { clientIdentifier, accessRole, groupIds } of permissions) {
    const roles = groupsByClient.get(clientIdentifier) ??
      new Map<string, Set<string>>();
    const groups = roles.get(accessRole) ?? new Set<string>();
    for (const groupId of groupIds) groups.add(groupId);
    roles.set(accessRole, groups);
    groupsByClient.set(clientIdentifier, roles);
  }

  return [...groupsByClient.entries()].flatMap(([clientIdentifier, roles]) =>
    [...roles.entries()].map(([accessRole, groupIds]) => ({
      clientIdentifier,
      accessRole,
      groupIds: [...groupIds].sort((left, right) => left.localeCompare(right)),
    })),
  )
    .sort(
      (left, right) =>
        left.accessRole.localeCompare(right.accessRole) ||
        left.clientIdentifier.localeCompare(right.clientIdentifier),
    );
}

export function serializeUserModuleAccessPermissions(
  permissions: readonly UserModuleAccessPermission[],
): string {
  return JSON.stringify(normalizeUserModuleAccessPermissions(permissions));
}

export const USER_ADMIN_RPC_CONTRACT = {
  addUser: ["username", "email", "firstName", "lastName", "enabled", "emailVerified", "temporary_password", "group_ids"],
  updateUser: ["userId", "username", "email", "firstName", "lastName", "enabled", "emailVerified", "temporary_password", "group_ids"],
  deleteUser: ["userId"],
  addGroup: ["name"],
  updateGroup: ["groupId", "name"],
  deleteGroup: ["groupId"],
  addClient: ["clientId", "name", "description", "enabled"],
  updateClient: ["clientId", "name", "description", "enabled"],
  addRole: ["name", "description"],
  addClientRole: ["clientId", "name", "description"],
  updateRole: ["roleId", "roleName", "clientId", "name", "description"],
  assignGroupRole: ["groupId", "groupName", "roleId", "roleName", "clientId"],
  removeGroupRole: ["groupId", "groupName", "roleId", "roleName", "clientId"],
  assignUserToGroup: ["userId", "username", "groupId", "groupName"],
  removeUserFromGroup: ["userId", "username", "groupId", "groupName"],
  getUserModuleAccessOptions: ["userId"],
  setUserModuleAccess: ["userId", "assignments"],
} as const;

export type SupportedUserAdminRpc =
  keyof typeof USER_ADMIN_RPC_CONTRACT;

export const USER_ADMIN_TABLE_CONTRACT = {
  users: [
    "user_id", "username", "email", "first_name", "last_name", "enabled",
    "email_verified", "password_update_required", "last_login", "group_count",
    "role_count", "module_access", "module_access_count",
  ],
  groups: [
    "group_id", "group_display_name", "group_path", "parent_group_id", "user_count",
    "role_count",
  ],
  roles: [
    "role_id", "role_name", "role_display_name", "client_id", "client_identifier", "client_name",
    "description", "group_count", "user_count",
  ],
  clients: [
    "client_id", "client_identifier", "client_name", "description", "enabled",
  ],
  user_groups: [
    "membership_id", "user_id", "username", "group_id", "group_name",
    "group_display_name", "group_path",
  ],
  group_roles: [
    "assignment_id", "group_id", "group_name", "group_display_name",
    "role_id", "role_name", "role_display_name",
    "client_id", "client_identifier", "client_name",
  ],
  user_group_roles: [
    "id", "membership_id", "assignment_id", "user_id", "username", "email",
    "first_name", "last_name", "enabled", "email_verified",
    "password_update_required", "last_login", "group_id", "group_name",
    "group_display_name", "group_path", "role_id", "role_name",
    "role_display_name", "client_id", "client_identifier",
    "client_name",
  ],
} as const;

export type UserAdminTableName = keyof typeof USER_ADMIN_TABLE_CONTRACT;

export type UserAdminColumnDataType =
  | "boolean"
  | "epochtimestamp"
  | "int"
  | "long"
  | "string";

export type UserAdminTableSchema = {
  columns: ReadonlyArray<{
    name: string;
    serverDataType: UserAdminColumnDataType;
  }>;
  key: string;
  table: {
    module: "USER_ADMIN";
    table: UserAdminTableName;
  };
};

export const USER_ADMIN_SYSTEM_COLUMNS = [
  { name: "vuuCreatedTimestamp", serverDataType: "epochtimestamp" },
  { name: "vuuUpdatedTimestamp", serverDataType: "epochtimestamp" },
  { name: "vuuMsg", serverDataType: "string" },
] as const;

const columnTypes: Record<string, UserAdminColumnDataType> = {
  assignment_id: "string",
  client_id: "string",
  client_identifier: "string",
  client_name: "string",
  description: "string",
  email: "string",
  email_verified: "boolean",
  enabled: "boolean",
  first_name: "string",
  group_count: "int",
  group_id: "string",
  group_display_name: "string",
  group_name: "string",
  group_path: "string",
  id: "string",
  last_login: "long",
  last_name: "string",
  membership_id: "string",
  module_access: "string",
  module_access_count: "int",
  parent_group_id: "string",
  password_update_required: "boolean",
  role_count: "int",
  role_id: "string",
  role_name: "string",
  role_display_name: "string",
  user_count: "int",
  user_id: "string",
  username: "string",
  vuuCreatedTimestamp: "epochtimestamp",
  vuuMsg: "string",
  vuuUpdatedTimestamp: "epochtimestamp",
};

const tableKeys: Record<UserAdminTableName, string> = {
  clients: "client_id",
  group_roles: "assignment_id",
  groups: "group_id",
  roles: "role_id",
  user_group_roles: "id",
  user_groups: "membership_id",
  users: "user_id",
};

const schemaFor = (table: UserAdminTableName): UserAdminTableSchema => ({
  columns: [
    ...USER_ADMIN_TABLE_CONTRACT[table],
    ...USER_ADMIN_SYSTEM_COLUMNS.map(({ name }) => name),
  ].map((name) => ({
    name,
    serverDataType: columnTypes[name],
  })),
  key: tableKeys[table],
  table: { module: "USER_ADMIN", table },
});

export const USER_ADMIN_TABLE_SCHEMAS: Readonly<
  Record<UserAdminTableName, UserAdminTableSchema>
> = {
  clients: schemaFor("clients"),
  group_roles: schemaFor("group_roles"),
  groups: schemaFor("groups"),
  roles: schemaFor("roles"),
  user_group_roles: schemaFor("user_group_roles"),
  user_groups: schemaFor("user_groups"),
  users: schemaFor("users"),
};
