/**
 * The write-only fields in this contract are deliberately not table columns:
 * Keycloak never returns a user's password and it must not be echoed by VUU.
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

export const KEYCLOAK_CLIENT_ID_PREFIX = "vuu-";
export const VUU_PORTAL_CLIENT_IDENTIFIER = "vuu-portal";

export const isVuuClientId = (clientId: string) =>
  clientId.startsWith(KEYCLOAK_CLIENT_ID_PREFIX);

export const assertVuuClientId = (clientId: string) => {
  if (!isVuuClientId(clientId)) {
    throw new Error(
      `Keycloak client identifier must start with "${KEYCLOAK_CLIENT_ID_PREFIX}"`,
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

export const KEYCLOAK_ADMIN_RPC_CONTRACT = {
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
} as const;

export type SupportedKeycloakAdminRpc =
  keyof typeof KEYCLOAK_ADMIN_RPC_CONTRACT;

export const KEYCLOAK_ADMIN_TABLE_CONTRACT = {
  users: [
    "user_id", "username", "email", "first_name", "last_name", "enabled",
    "email_verified", "password_update_required", "last_login", "group_count",
    "role_count", "module_access", "module_access_count",
  ],
  groups: [
    "group_id", "group_path", "parent_group_id", "user_count",
    "role_count",
  ],
  roles: [
    "role_id", "role_name", "client_id", "client_identifier", "client_name",
    "description", "group_count", "user_count",
  ],
  clients: [
    "client_id", "client_identifier", "client_name", "description", "enabled",
  ],
  user_groups: [
    "membership_id", "user_id", "username", "group_id", "group_name",
    "group_path",
  ],
  group_roles: [
    "assignment_id", "group_id", "group_name", "role_id", "role_name",
    "client_id", "client_identifier", "client_name",
  ],
  user_group_roles: [
    "id", "membership_id", "assignment_id", "user_id", "username", "email",
    "first_name", "last_name", "enabled", "email_verified",
    "password_update_required", "last_login", "group_id", "group_name",
    "group_path", "role_id", "role_name", "client_id", "client_identifier",
    "client_name",
  ],
} as const;
