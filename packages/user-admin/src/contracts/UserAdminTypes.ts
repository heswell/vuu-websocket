import type {
  UserModuleAccessAssignment,
  UserModuleAccessOptions,
} from "./UserAdminContract";

export type UserAdminUser = {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  emailVerified?: boolean;
  requiredActions?: string[];
  createdTimestamp?: number;
  attributes?: Record<string, string | string[]>;
};

export type UserAdminGroup = {
  id: string;
  name: string;
  path?: string;
  parentId?: string;
  createdTimestamp?: number;
  /**
   * Explicit least-privilege policy for portal module access roles. A group
   * may be the default for more than one role, but each role must identify
   * exactly one default group among its eligible groups.
   */
  moduleAccessDefaultRoles?: string[];
};

export type UserAdminClient = {
  id: string;
  clientId: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  publicClient?: boolean;
  protocol?: string;
  createdTimestamp?: number;
};

export type UserAdminRole = {
  id: string;
  name: string;
  description?: string;
  clientRole?: boolean;
  containerId?: string;
  createdTimestamp?: number;
};

export type UserAdminSnapshot = {
  users: UserAdminUser[];
  groups: UserAdminGroup[];
  clients: UserAdminClient[];
  clientRoles: Array<{ client: UserAdminClient; role: UserAdminRole }>;
  userGroups: Array<{ user: UserAdminUser; group: UserAdminGroup }>;
  groupRoles: Array<{
    group: UserAdminGroup;
    role: UserAdminRole;
    client?: UserAdminClient;
  }>;
  timestamp: number;
};

export type UserAdminSnapshotSource = () => Promise<UserAdminSnapshot>;

export type UserAdminEditableUserChanges = Partial<
  Pick<UserAdminUser, "username" | "email" | "firstName" | "lastName" | "enabled" | "emailVerified">
>;

export type UserAdminUserEdit = {
  userId: string;
  changes: UserAdminEditableUserChanges;
  assignments?: readonly UserModuleAccessAssignment[];
};

export type UserAdminOperations = {
  addUser: (params: {
    username: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    enabled?: boolean;
    emailVerified?: boolean;
    temporary_password?: string;
  }) => Promise<void>;
  updateUser: (params: {
    userId: string;
    username?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    enabled?: boolean;
    emailVerified?: boolean;
    temporary_password?: string;
  }) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  findUserByUsername: (username: string) => Promise<UserAdminUser | undefined>;
  syncUserGroups: (userId: string, groupIds: string[]) => Promise<void>;
  addGroup: (params: { name: string }) => Promise<void>;
  updateGroup: (groupId: string, params: { name: string }) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  addClient: (params: {
    clientId: string;
    name?: string;
    description?: string;
    enabled?: boolean;
  }) => Promise<void>;
  updateClient: (
    clientId: string,
    params: { name?: string; description?: string; enabled?: boolean },
  ) => Promise<void>;
  addRole: (params: { name: string; description?: string }) => Promise<void>;
  addClientRole: (
    client: { clientKey: string },
    params: { name: string; description?: string },
  ) => Promise<void>;
  updateRealmRole: (
    roleId: string,
    params: { name?: string; description?: string },
  ) => Promise<void>;
  updateClientRole: (
    clientId: string,
    roleName: string,
    params: { name?: string; description?: string },
  ) => Promise<void>;
  addRoleToGroup: (
    group: { groupId?: string; groupName?: string },
    role: { roleId?: string; roleName?: string },
    client?: { clientKey: string },
  ) => Promise<void>;
  removeRoleFromGroup: (
    group: { groupId?: string; groupName?: string },
    role: { roleId?: string; roleName?: string },
    client?: { clientKey: string },
  ) => Promise<void>;
  addUserToGroup: (
    user: { userId?: string; username?: string },
    group: { groupId?: string; groupName?: string },
  ) => Promise<void>;
  removeUserFromGroup: (
    user: { userId?: string; username?: string },
    group: { groupId?: string; groupName?: string },
  ) => Promise<void>;
  getUserModuleAccessOptions: (userId: string) => Promise<UserModuleAccessOptions>;
  setUserModuleAccess: (
    userId: string,
    assignments: readonly UserModuleAccessAssignment[],
  ) => Promise<void>;
  applyUserEdits?: (edits: readonly UserAdminUserEdit[]) => Promise<void>;
};

export function clientForRole(
  clients: UserAdminClient[],
  requestedClient: UserAdminClient,
  role: UserAdminRole,
) {
  if (!role.containerId) return requestedClient;
  return clients.find(({ id }) => id === role.containerId) ?? requestedClient;
}
