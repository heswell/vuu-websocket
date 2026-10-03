import {
  CreateSessionTableRpcHandler,
  InMemSessionDataTable,
  type Column,
  type DataTable,
  type PreparedSessionChange,
  type PreparedSessionSave,
  type RpcParams,
  type TableContainer,
} from "@heswell/vuu-server";
import { RpcResult, type VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import {
  assertVuuClientId,
  clientForRole,
  isVuuClientId,
  normalizeUserModuleAccessPermissions,
  type UserAdminClient,
  type UserAdminEditableUserChanges,
  type UserAdminOperations,
  type UserAdminRole,
  type UserAdminSnapshot,
  type UserAdminSnapshotSource,
  type UserAdminUserEdit,
  type UserModuleAccessAssignment,
  type UserModuleAccessPermission,
} from "@heswell/user-admin";
import { getUserAdminSnapshot } from "../UserAdminSnapshotStore";

type Params = Record<string, unknown>;

const success = (data?: unknown): RpcResult => ({ type: "SUCCESS_RESULT", data });
const failure = (errorMessage: string): RpcResult => ({
  type: "ERROR_RESULT",
  errorMessage,
});
const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const ensureRequiredNonEmptyString = (value: unknown, fieldName: string) => {
  if (value === undefined) throw new Error(`Missing required RPC param "${fieldName}"`);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid RPC param "${fieldName}"`);
  }
  return value.trim();
};

const getOptionalNonEmptyString = (value: unknown, fieldName: string) =>
  value === undefined ? undefined : ensureRequiredNonEmptyString(value, fieldName);

const getOptionalBoolean = (value: unknown, fieldName: string) => {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`Invalid RPC param "${fieldName}"`);
  return value;
};

const getOptionalStringArray = (value: unknown, fieldName: string) => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`Invalid RPC param "${fieldName}"`);
  }
  return [...new Set(value.map((item) => item.trim()))];
};

const getRequiredEntityRef = (params: Params, idName: string, keyName: string) => {
  const id = getOptionalNonEmptyString(params[idName], idName);
  const key = getOptionalNonEmptyString(params[keyName], keyName);
  if (!id && !key) {
    throw new Error(`Missing required RPC param "${idName}" or "${keyName}"`);
  }
  return { id, key };
};

/** Write-only session columns that are never part of a source table. */
export const USER_ADMIN_SESSION_COLUMNS = {
  users: ["permissions", "temporary_password"],
  groups: ["group_name", "role_assignments"],
} as const;

type SessionSaver = (
  prepared: PreparedSessionSave,
  sessionTable: InMemSessionDataTable,
) => Promise<void>;

type RoleAssignment = {
  role: UserAdminRole;
  client: UserAdminClient;
};

export class UserAdminService extends CreateSessionTableRpcHandler {
  private readonly sessionSavers: Partial<Record<string, SessionSaver>> = {
    users: (prepared) => this.saveUsersSession(prepared),
    groups: (prepared, sessionTable) => this.saveGroupsSession(prepared, sessionTable),
    roles: (prepared, sessionTable) => this.saveRolesSession(prepared, sessionTable),
  };

  constructor(
    tableContainer: TableContainer,
    private readonly createOperations: () => Promise<UserAdminOperations>,
    private readonly refreshAfterMutation: (reason: string) => Promise<void>,
    /** Reads current identity-provider state; used to validate session saves. */
    private readonly readSnapshot: UserAdminSnapshotSource = getUserAdminSnapshot,
  ) {
    super(tableContainer);
    this.registerRpc("addUser", this.addUser);
    this.registerRpc("updateUser", this.updateUser);
    this.registerRpc("deleteUser", this.deleteUser);
    this.registerRpc("addGroup", this.addGroup);
    this.registerRpc("updateGroup", this.updateGroup);
    this.registerRpc("deleteGroup", this.deleteGroup);
    this.registerRpc("addClient", this.addClient);
    this.registerRpc("updateClient", this.updateClient);
    this.registerRpc("addRole", this.addRole);
    this.registerRpc("addClientRole", this.addClientRole);
    this.registerRpc("updateRole", this.updateRole);
    this.registerRpc("addRoleToGroup", this.addRoleToGroup);
    this.registerRpc("assignRoleToGroup", this.addRoleToGroup);
    this.registerRpc("assignGroupRole", this.addRoleToGroup);
    this.registerRpc("removeRoleFromGroup", this.removeRoleFromGroup);
    this.registerRpc("removeGroupRole", this.removeRoleFromGroup);
    this.registerRpc("addUserToGroup", this.addUserToGroup);
    this.registerRpc("assignUserToGroup", this.addUserToGroup);
    this.registerRpc("removeUserFromGroup", this.removeUserFromGroup);
    this.registerRpc("getUserModuleAccessOptions", this.getUserModuleAccessOptions);
    this.registerRpc("setUserModuleAccess", this.setUserModuleAccess);
  }

  protected getSessionTableCustomColumns(sourceTable: DataTable): Column[] {
    const tableName = sourceTable.tableDef.name;
    const names: readonly string[] =
      tableName in USER_ADMIN_SESSION_COLUMNS
        ? USER_ADMIN_SESSION_COLUMNS[tableName as keyof typeof USER_ADMIN_SESSION_COLUMNS]
        : [];
    const offset = sourceTable.tableDef.columns.length;
    return names.map((name, index) => ({
      name,
      dataType: "string",
      index: offset + index,
    }));
  }

  protected override async handleEndEditSession(
    params: RpcParams<Params>,
  ): Promise<RpcResult> {
    const { namedParams, viewport } = params;
    const sessionTable = viewport.dataTable;
    const saveSession =
      sessionTable instanceof InMemSessionDataTable
        ? this.sessionSavers[sessionTable.tableDef.name]
        : undefined;
    if (
      !(sessionTable instanceof InMemSessionDataTable) ||
      !saveSession ||
      !namedParams.save
    ) {
      return super.handleEndEditSession(params);
    }

    const prepared = this.prepareSessionSave(
      sessionTable,
      namedParams.force === true,
    );
    if ("type" in prepared) return prepared;

    try {
      await saveSession(prepared, sessionTable);
      // New rows are created by the identity provider with their own keys and
      // arrive through the refresh; only edits are applied locally.
      this.applySessionSave(sessionTable, {
        ...prepared,
        changes: prepared.changes.filter(({ action }) => action === ""),
      });
      await this.refreshAfterMutation(`session:${sessionTable.tableDef.name}`);
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  }

  private readonly addUser = async ({ namedParams }: RpcParams<Params>) => {
    try {
      const params = namedParams;
      const username = ensureRequiredNonEmptyString(params.username, "username");
      const email = getOptionalNonEmptyString(params.email, "email");
      const firstName = getOptionalNonEmptyString(params.firstName, "firstName");
      const lastName = getOptionalNonEmptyString(params.lastName, "lastName");
      const enabled = getOptionalBoolean(params.enabled, "enabled") ?? true;
      const emailVerified = getOptionalBoolean(params.emailVerified, "emailVerified");
      const temporary_password = getOptionalNonEmptyString(
        params.temporary_password,
        "temporary_password",
      );
      const group_ids = getOptionalStringArray(params.group_ids, "group_ids") ?? [];
      await this.assertUsernameIsUnique(username);
      const client = await this.createOperations();
      await client.addUser({
        username,
        email,
        firstName,
        lastName,
        enabled,
        emailVerified,
        temporary_password,
      });
      if (group_ids.length) {
        const user = await client.findUserByUsername(username);
        if (!user) throw new Error(`User admin user not found after creation: ${username}`);
        await client.syncUserGroups(user.id, group_ids);
      }
      await this.refreshAfterMutation("rpc:addUser");
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly updateUser = async ({ namedParams }: RpcParams<Params>) => {
    try {
      const params = namedParams;
      const userId = ensureRequiredNonEmptyString(params.userId, "userId");
      const changes = {
        username: getOptionalNonEmptyString(params.username, "username"),
        email: getOptionalNonEmptyString(params.email, "email"),
        firstName: getOptionalNonEmptyString(params.firstName, "firstName"),
        lastName: getOptionalNonEmptyString(params.lastName, "lastName"),
        enabled: getOptionalBoolean(params.enabled, "enabled"),
        emailVerified: getOptionalBoolean(params.emailVerified, "emailVerified"),
        temporary_password: getOptionalNonEmptyString(
          params.temporary_password,
          "temporary_password",
        ),
      };
      const group_ids = getOptionalStringArray(params.group_ids, "group_ids");
      const update = Object.fromEntries(
        Object.entries(changes).filter(([, value]) => value !== undefined),
      );
      if (Object.keys(update).length === 0 && group_ids === undefined) {
        throw new Error("No user fields supplied");
      }
      if (changes.username !== undefined) {
        await this.assertUsernameIsUnique(changes.username, userId);
      }
      const client = await this.createOperations();
      if (Object.keys(update).length) {
        await client.updateUser({ userId, ...update });
      }
      if (group_ids !== undefined) {
        await client.syncUserGroups(userId, group_ids);
      }
      await this.refreshAfterMutation("rpc:updateUser");
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly deleteUser = async ({ namedParams }: RpcParams<Params>) => {
    try {
      const userId = ensureRequiredNonEmptyString(namedParams.userId, "userId");
      await (await this.createOperations()).deleteUser(userId);
      await this.refreshAfterMutation("rpc:deleteUser");
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly addGroup = async ({ namedParams }: RpcParams<Params>) => {
    try {
      const name = ensureRequiredNonEmptyString(namedParams.name, "name");
      await (await this.createOperations()).addGroup({ name });
      await this.refreshAfterMutation("rpc:addGroup");
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly updateGroup = async ({ namedParams }: RpcParams<Params>) => {
    try {
      const groupId = ensureRequiredNonEmptyString(namedParams.groupId, "groupId");
      const name = ensureRequiredNonEmptyString(namedParams.name, "name");
      await (await this.createOperations()).updateGroup(groupId, { name });
      await this.refreshAfterMutation("rpc:updateGroup");
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly deleteGroup = async ({ namedParams }: RpcParams<Params>) => {
    try {
      const groupId = ensureRequiredNonEmptyString(namedParams.groupId, "groupId");
      await (await this.createOperations()).deleteGroup(groupId);
      await this.refreshAfterMutation("rpc:deleteGroup");
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly addClient = async ({ namedParams }: RpcParams<Params>) => {
    try {
      const clientId = ensureRequiredNonEmptyString(namedParams.clientId, "clientId");
      assertVuuClientId(clientId);
      const name = getOptionalNonEmptyString(namedParams.name, "name");
      const description = getOptionalNonEmptyString(namedParams.description, "description");
      const enabled = getOptionalBoolean(namedParams.enabled, "enabled") ?? true;
      await (await this.createOperations()).addClient({ clientId, name, description, enabled });
      await this.refreshAfterMutation("rpc:addClient");
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly updateClient = async ({ namedParams }: RpcParams<Params>) => {
    try {
      const clientId = ensureRequiredNonEmptyString(namedParams.clientId, "clientId");
      assertVuuClientId(clientId);
      const changes = {
        name: getOptionalNonEmptyString(namedParams.name, "name"),
        description: getOptionalNonEmptyString(namedParams.description, "description"),
        enabled: getOptionalBoolean(namedParams.enabled, "enabled"),
      };
      const update = Object.fromEntries(
        Object.entries(changes).filter(([, value]) => value !== undefined),
      );
      if (!Object.keys(update).length) throw new Error("No client fields supplied");
      await (await this.createOperations()).updateClient(clientId, update);
      await this.refreshAfterMutation("rpc:updateClient");
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly addRole = async ({ namedParams }: RpcParams<Params>) => {
    try {
      const name = ensureRequiredNonEmptyString(namedParams.name, "name");
      const description = getOptionalNonEmptyString(namedParams.description, "description") ?? "";
      await (await this.createOperations()).addRole({ name, description });
      await this.refreshAfterMutation("rpc:addRole");
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly addClientRole = async ({ namedParams }: RpcParams<Params>) => {
    try {
      const clientId = ensureRequiredNonEmptyString(namedParams.clientId, "clientId");
      assertVuuClientId(clientId);
      const name = ensureRequiredNonEmptyString(namedParams.name, "name");
      const description = getOptionalNonEmptyString(namedParams.description, "description") ?? "";
      await (await this.createOperations()).addClientRole({ clientKey: clientId }, { name, description });
      await this.refreshAfterMutation("rpc:addClientRole");
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly updateRole = async ({ namedParams }: RpcParams<Params>) => {
    try {
      const roleId = getOptionalNonEmptyString(namedParams.roleId, "roleId");
      const roleName = getOptionalNonEmptyString(namedParams.roleName, "roleName");
      const name = getOptionalNonEmptyString(namedParams.name, "name");
      const description = getOptionalNonEmptyString(namedParams.description, "description");
      if (!roleId && !roleName) throw new Error('Missing required RPC param "roleId" or "roleName"');
      if (name === undefined && description === undefined) throw new Error("No role fields supplied");
      const clientKey = getOptionalNonEmptyString(namedParams.clientId, "clientId");
      if (clientKey) assertVuuClientId(clientKey);
      const client = await this.createOperations();
      if (clientKey) {
        if (!roleName) throw new Error('Missing required RPC param "roleName" for a client role');
        await client.updateClientRole(
          clientKey,
          roleName,
          { ...(name === undefined ? {} : { name }), ...(description === undefined ? {} : { description }) },
        );
      } else {
        if (!roleId) throw new Error('Missing required RPC param "roleId" for a realm role');
        await client.updateRealmRole(roleId, {
          ...(name === undefined ? {} : { name }),
          ...(description === undefined ? {} : { description }),
        });
      }
      await this.refreshAfterMutation("rpc:updateRole");
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly addRoleToGroup = async ({ namedParams }: RpcParams<Params>) =>
    this.mutateRelationship(namedParams, "addRoleToGroup", (client, group, role, key) =>
      client.addRoleToGroup(group, role, key ? { clientKey: key } : undefined),
    );

  private readonly removeRoleFromGroup = async ({ namedParams }: RpcParams<Params>) =>
    this.mutateRelationship(namedParams, "removeRoleFromGroup", (client, group, role, key) =>
      client.removeRoleFromGroup(group, role, key ? { clientKey: key } : undefined),
    );

  private readonly addUserToGroup = async ({ namedParams }: RpcParams<Params>) =>
    this.mutateUserGroup(namedParams, "addUserToGroup", (client, user, group) =>
      client.addUserToGroup(user, group),
    );

  private readonly removeUserFromGroup = async ({ namedParams }: RpcParams<Params>) =>
    this.mutateUserGroup(namedParams, "removeUserFromGroup", (client, user, group) =>
      client.removeUserFromGroup(user, group),
    );

  private readonly getUserModuleAccessOptions = async ({
    namedParams,
  }: RpcParams<Params>) => {
    try {
      const userId = ensureRequiredNonEmptyString(namedParams.userId, "userId");
      const data = await (await this.createOperations()).getUserModuleAccessOptions(userId);
      return success(data);
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly setUserModuleAccess = async ({
    namedParams,
  }: RpcParams<Params>) => {
    try {
      const userId = ensureRequiredNonEmptyString(namedParams.userId, "userId");
      const assignments = parseModuleAccessAssignments(namedParams.assignments);
      await (await this.createOperations()).setUserModuleAccess(userId, assignments);
      await this.refreshAfterMutation("rpc:setUserModuleAccess");
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private async mutateRelationship(
    namedParams: Params,
    reason: string,
    mutate: (
      client: UserAdminOperations,
      group: { groupId?: string; groupName?: string },
      role: { roleId?: string; roleName?: string },
      clientKey?: string,
    ) => Promise<void>,
  ) {
    try {
      const groupRef = getRequiredEntityRef(namedParams, "groupId", "groupName");
      const roleRef = getRequiredEntityRef(namedParams, "roleId", "roleName");
      const clientKey = getOptionalNonEmptyString(namedParams.clientId, "clientId");
      if (clientKey) assertVuuClientId(clientKey);
      const client = await this.createOperations();
      await mutate(
        client,
        { groupId: groupRef.id, groupName: groupRef.key },
        { roleId: roleRef.id, roleName: roleRef.key },
        clientKey,
      );
      await this.refreshAfterMutation(`rpc:${reason}`);
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  }

  private async mutateUserGroup(
    namedParams: Params,
    reason: string,
    mutate: (
      client: UserAdminOperations,
      user: { userId?: string; username?: string },
      group: { groupId?: string; groupName?: string },
    ) => Promise<void>,
  ) {
    try {
      const userRef = getRequiredEntityRef(namedParams, "userId", "username");
      const groupRef = getRequiredEntityRef(namedParams, "groupId", "groupName");
      const client = await this.createOperations();
      await mutate(
        client,
        { userId: userRef.id, username: userRef.key },
        { groupId: groupRef.id, groupName: groupRef.key },
      );
      await this.refreshAfterMutation(`rpc:${reason}`);
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  }

  private async saveUsersSession(prepared: PreparedSessionSave) {
    const client = await this.createOperations();
    const edits = await this.prepareUserEdits(prepared, client);
    if (!edits.length) return;
    if (client.applyUserEdits) {
      await client.applyUserEdits(edits);
    } else {
      await this.applyUserEditsFallback(client, edits);
    }
  }

  private async prepareUserEdits(
    { sourceTable, changes }: PreparedSessionSave,
    client: UserAdminOperations,
  ): Promise<UserAdminUserEdit[]> {
    const edits: UserAdminUserEdit[] = [];
    for (const change of changes) {
      assertEditOnly(change, "users", "addUser", "deleteUser");
      const sourceRow = change.sourceRow!;
      const { cellUpdates } = change;
      if (
        hasOwn(cellUpdates, "username") &&
        cellUpdates.username !== sourceRow[sourceTable.columnMap.username]
      ) {
        throw new Error("username is read-only");
      }
      const userId = String(sourceRow[sourceTable.columnMap.user_id]);
      const userChanges = parseEditableUserChanges(cellUpdates);
      const temporaryPassword = parseTemporaryPassword(cellUpdates);
      const assignments = hasOwn(cellUpdates, "permissions")
        ? await this.parseAndValidatePermissions(
            client,
            userId,
            cellUpdates.permissions,
          )
        : undefined;
      if (
        Object.keys(userChanges).length ||
        temporaryPassword !== undefined ||
        assignments !== undefined
      ) {
        edits.push({
          userId,
          changes: userChanges,
          ...(temporaryPassword !== undefined ? { temporaryPassword } : {}),
          assignments,
        });
      }
    }
    return edits;
  }

  /**
   * Applications are identified by their access role. The clientIdentifier
   * supplied by the UI is the application's own client (or empty when the
   * portal has no descriptor for the role), so it is not used for matching.
   */
  private async parseAndValidatePermissions(
    client: UserAdminOperations,
    userId: string,
    value: unknown,
  ): Promise<UserModuleAccessAssignment[]> {
    const permissions = parseUserModulePermissions(value);
    const options = await client.getUserModuleAccessOptions(userId);
    const modules = new Map(
      options.modules.map((module) => [module.accessRole, module]),
    );
    const assignments: UserModuleAccessAssignment[] = [];
    for (const permission of permissions) {
      const module = modules.get(permission.accessRole);
      if (!module) {
        throw new Error(
          `Invalid permissions application: unknown access role "${permission.accessRole}"`,
        );
      }
      for (const groupId of permission.groupIds) {
        if (!module.groups.some((group) => group.groupId === groupId)) {
          throw new Error(
            `Invalid permissions group: ${groupId} does not grant ${permission.accessRole}`,
          );
        }
        assignments.push({ accessRole: permission.accessRole, groupId });
      }
    }
    return assignments;
  }

  private async applyUserEditsFallback(
    client: UserAdminOperations,
    edits: readonly UserAdminUserEdit[],
  ) {
    for (const { userId, changes, temporaryPassword, assignments } of edits) {
      if (Object.keys(changes).length || temporaryPassword) {
        await client.updateUser({
          userId,
          ...changes,
          ...(temporaryPassword ? { temporary_password: temporaryPassword } : {}),
        });
      }
      if (assignments !== undefined) {
        await client.setUserModuleAccess(userId, assignments);
      }
    }
  }

  /**
   * Creates groups from new session rows and reconciles the roles of edited
   * groups. `role_assignments` is the complete, JSON-encoded list of role IDs
   * the group should hold. Everything is validated before Keycloak is changed.
   */
  private async saveGroupsSession(
    { sourceTable, changes }: PreparedSessionSave,
    sessionTable: InMemSessionDataTable,
  ) {
    const snapshot = await this.readSnapshot();
    const roles = roleAssignmentsById(snapshot);
    const groupNames = new Set(snapshot.groups.map(({ name }) => name));
    const creations: Array<{ name: string; roles: RoleAssignment[] }> = [];
    const updates: Array<{ groupId: string; roles: RoleAssignment[] }> = [];

    for (const change of changes) {
      if (change.action === "addRow") {
        const name = parseGroupName(
          sessionValue(sessionTable, change.row, "group_name"),
        );
        if (groupNames.has(name)) {
          throw new Error(`A group named "${name}" already exists`);
        }
        groupNames.add(name);
        creations.push({
          name,
          roles: resolveRoles(
            roles,
            parseRoleAssignments(
              sessionValue(sessionTable, change.row, "role_assignments"),
            ),
          ),
        });
        continue;
      }
      assertEditOnly(change, "groups", "addGroup", "deleteGroup");
      assertEditableColumns(change, "groups", ["role_assignments"]);
      if (!hasOwn(change.cellUpdates, "role_assignments")) continue;
      const groupId = String(change.sourceRow![sourceTable.columnMap.group_id]);
      if (!snapshot.groups.some(({ id }) => id === groupId)) {
        throw new Error(`User admin group not found: ${groupId}`);
      }
      updates.push({
        groupId,
        roles: resolveRoles(
          roles,
          parseRoleAssignments(change.cellUpdates.role_assignments),
        ),
      });
    }

    if (!creations.length && !updates.length) return;
    const client = await this.createOperations();
    for (const { name, roles: groupRoles } of creations) {
      await this.createGroupWithRoles(client, snapshot, name, groupRoles);
    }
    for (const { groupId, roles: groupRoles } of updates) {
      await syncGroupRoles(client, snapshot, groupId, groupRoles);
    }
  }

  private async createGroupWithRoles(
    client: UserAdminOperations,
    before: UserAdminSnapshot,
    name: string,
    roles: readonly RoleAssignment[],
  ) {
    const existingGroupIds = new Set(before.groups.map(({ id }) => id));
    await client.addGroup({ name });
    const group = (await this.readSnapshot()).groups.find(
      (candidate) => candidate.name === name && !existingGroupIds.has(candidate.id),
    );
    if (!group) throw new Error(`User admin group not found after creation: ${name}`);
    try {
      for (const assignment of roles) {
        await client.addRoleToGroup(
          { groupId: group.id },
          roleRef(assignment),
          { clientKey: assignment.client.clientId },
        );
      }
    } catch (error) {
      try {
        await client.deleteGroup(group.id);
      } catch (rollbackError) {
        throw new Error(
          `${toErrorMessage(error)}; rollback failed: ${toErrorMessage(rollbackError)}`,
        );
      }
      throw error;
    }
  }

  /**
   * Creates client roles from new session rows and renames or re-describes
   * edited roles.
   */
  private async saveRolesSession(
    { sourceTable, changes }: PreparedSessionSave,
    sessionTable: InMemSessionDataTable,
  ) {
    const snapshot = await this.readSnapshot();
    const roleNamesByClient = new Map<string, Set<string>>();
    for (const { client, role } of snapshot.clientRoles) {
      const owner = clientForRole(snapshot.clients, client, role);
      const names = roleNamesByClient.get(owner.clientId) ?? new Set<string>();
      names.add(role.name);
      roleNamesByClient.set(owner.clientId, names);
    }
    const reserveRoleName = (clientIdentifier: string, name: string) => {
      const names = roleNamesByClient.get(clientIdentifier) ?? new Set<string>();
      if (names.has(name)) {
        throw new Error(`A role named "${name}" already exists on ${clientIdentifier}`);
      }
      names.add(name);
      roleNamesByClient.set(clientIdentifier, names);
    };
    const creations: Array<{ clientIdentifier: string; name: string; description: string }> = [];
    const updates: Array<{
      clientIdentifier: string;
      roleName: string;
      changes: { name?: string; description?: string };
    }> = [];

    for (const change of changes) {
      if (change.action === "addRow") {
        const value = (column: string) => sessionValue(sessionTable, change.row, column);
        const name = ensureRequiredNonEmptyString(value("role_name"), "role_name");
        const clientId = ensureRequiredNonEmptyString(value("client_id"), "client_id");
        const clientIdentifier = ensureRequiredNonEmptyString(
          value("client_identifier"),
          "client_identifier",
        );
        const client = snapshot.clients.find(({ id }) => id === clientId);
        if (!client || client.clientId !== clientIdentifier) {
          throw new Error("client_id and client_identifier must identify the same client");
        }
        assertVuuClientId(clientIdentifier);
        reserveRoleName(clientIdentifier, name);
        const description = value("description");
        creations.push({
          clientIdentifier,
          name,
          description: typeof description === "string" ? description : "",
        });
        continue;
      }
      assertEditOnly(change, "roles", "addClientRole");
      assertEditableColumns(change, "roles", ["role_name", "description"]);
      const sourceRow = change.sourceRow!;
      const { columnMap } = sourceTable;
      const roleName = String(sourceRow[columnMap.role_name]);
      const clientIdentifier = assertVuuClientId(
        String(sourceRow[columnMap.client_identifier]),
      );
      const roleChanges: { name?: string; description?: string } = {};
      if (hasOwn(change.cellUpdates, "role_name")) {
        const name = ensureRequiredNonEmptyString(change.cellUpdates.role_name, "role_name");
        if (name !== roleName) {
          reserveRoleName(clientIdentifier, name);
          roleChanges.name = name;
        }
      }
      if (hasOwn(change.cellUpdates, "description")) {
        const { description } = change.cellUpdates;
        if (typeof description !== "string") {
          throw new Error('Invalid roles session value for "description"');
        }
        roleChanges.description = description;
      }
      if (Object.keys(roleChanges).length) {
        updates.push({ clientIdentifier, roleName, changes: roleChanges });
      }
    }

    if (!creations.length && !updates.length) return;
    const client = await this.createOperations();
    for (const { clientIdentifier, name, description } of creations) {
      await client.addClientRole({ clientKey: clientIdentifier }, { name, description });
    }
    for (const { clientIdentifier, roleName, changes: roleChanges } of updates) {
      await client.updateClientRole(clientIdentifier, roleName, roleChanges);
    }
  }

  private async assertUsernameIsUnique(username: string, userId?: string) {
    const normalized = username.toLocaleLowerCase();
    const snapshot = await this.readSnapshot();
    if (
      snapshot.users.some(
        (user) =>
          user.id !== userId && user.username.toLocaleLowerCase() === normalized,
      )
    ) {
      throw new Error("username must be unique");
    }
  }
}

const hasOwn = (record: object, key: string) =>
  Object.prototype.hasOwnProperty.call(record, key);

function assertEditOnly(
  change: PreparedSessionChange,
  tableName: string,
  createRpc?: string,
  deleteRpc?: string,
) {
  if (change.action === "addRow") {
    throw new Error(
      `Adding ${tableName} rows in an edit session is not supported` +
        (createRpc ? `; use the ${createRpc} RPC` : ""),
    );
  }
  if (change.action === "deleteRow") {
    throw new Error(
      `Deleting ${tableName} rows in an edit session is not supported` +
        (deleteRpc ? `; use the ${deleteRpc} RPC` : ""),
    );
  }
  if (!change.sourceRow) {
    throw new Error(`${tableName} row not found: ${change.key}`);
  }
}

function assertEditableColumns(
  change: PreparedSessionChange,
  tableName: string,
  editableColumns: readonly string[],
) {
  for (const column of Object.keys(change.cellUpdates)) {
    if (!editableColumns.includes(column)) {
      throw new Error(`${tableName} column "${column}" is read-only`);
    }
  }
}

function sessionValue(
  sessionTable: InMemSessionDataTable,
  row: VuuDataRow,
  column: string,
) {
  const index = sessionTable.columnMap[column];
  return index === undefined ? undefined : row[index];
}

const INVALID_GROUP_NAME = /[\s/]/;

function parseGroupName(value: unknown) {
  const name = ensureRequiredNonEmptyString(value, "group_name");
  if (INVALID_GROUP_NAME.test(name)) {
    throw new Error("Group names cannot contain spaces or slashes");
  }
  return name;
}

function parseRoleAssignments(value: unknown): string[] {
  if (value === undefined || value === "") return [];
  if (typeof value !== "string") {
    throw new Error("Invalid role_assignments: expected JSON array");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Invalid role_assignments: expected JSON array");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.some((roleId) => typeof roleId !== "string" || roleId.trim() === "")
  ) {
    throw new Error("Invalid role_assignments: expected an array of role IDs");
  }
  return [...new Set(parsed as string[])];
}

function roleAssignmentsById(snapshot: UserAdminSnapshot) {
  return new Map(
    snapshot.clientRoles.map(({ client, role }) => [
      role.id,
      { role, client: clientForRole(snapshot.clients, client, role) },
    ]),
  );
}

function resolveRoles(
  roles: ReadonlyMap<string, RoleAssignment>,
  roleIds: readonly string[],
) {
  return roleIds.map((roleId) => {
    const assignment = roles.get(roleId);
    if (!assignment) throw new Error(`User admin role not found: ${roleId}`);
    if (!isVuuClientId(assignment.client.clientId)) {
      throw new Error(`User admin role ${roleId} is not owned by a vuu- client`);
    }
    return assignment;
  });
}

const roleRef = ({ role }: RoleAssignment) => ({
  roleId: role.id,
  roleName: role.name,
});

async function syncGroupRoles(
  client: UserAdminOperations,
  snapshot: UserAdminSnapshot,
  groupId: string,
  desired: readonly RoleAssignment[],
) {
  const roles = roleAssignmentsById(snapshot);
  const current = snapshot.groupRoles
    .filter(({ group }) => group.id === groupId)
    .flatMap(({ role }) => {
      const assignment = roles.get(role.id);
      return assignment ? [assignment] : [];
    });
  const currentIds = new Set(current.map(({ role }) => role.id));
  const desiredIds = new Set(desired.map(({ role }) => role.id));
  for (const assignment of current) {
    if (!desiredIds.has(assignment.role.id)) {
      await client.removeRoleFromGroup(
        { groupId },
        roleRef(assignment),
        { clientKey: assignment.client.clientId },
      );
    }
  }
  for (const assignment of desired) {
    if (!currentIds.has(assignment.role.id)) {
      await client.addRoleToGroup(
        { groupId },
        roleRef(assignment),
        { clientKey: assignment.client.clientId },
      );
    }
  }
}

function parseTemporaryPassword(cellUpdates: Record<string, unknown>) {
  if (!hasOwn(cellUpdates, "temporary_password")) return undefined;
  const value = cellUpdates.temporary_password;
  if (typeof value !== "string") {
    throw new Error('Invalid users session value for "temporary_password"');
  }
  return value === "" ? undefined : value;
}

const editableUserFields = {
  email: "email",
  first_name: "firstName",
  last_name: "lastName",
  enabled: "enabled",
  email_verified: "emailVerified",
} as const;

function parseEditableUserChanges(
  cellUpdates: Record<string, unknown>,
): UserAdminEditableUserChanges {
  const changes: UserAdminEditableUserChanges = {};
  for (const [column, value] of Object.entries(cellUpdates)) {
    if (column === "permissions") continue;
    const field = editableUserFields[column as keyof typeof editableUserFields];
    if (!field) continue;
    if (field === "enabled" || field === "emailVerified") {
      if (typeof value !== "boolean") {
        throw new Error(`Invalid users session value for "${column}"`);
      }
      changes[field] = value;
    } else {
      if (typeof value !== "string") {
        throw new Error(`Invalid users session value for "${column}"`);
      }
      changes[field] = value;
    }
  }
  return changes;
}

function parseUserModulePermissions(value: unknown): UserModuleAccessPermission[] {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Invalid permissions: expected JSON array");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Invalid permissions: expected JSON array");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Invalid permissions: expected JSON array");
  }

  const accessRoles = new Set<string>();
  const permissions = parsed.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`Invalid permissions application at index ${index}`);
    }
    const record = item as Record<string, unknown>;
    const unknownFields = Object.keys(record).filter(
      (field) => !["clientIdentifier", "accessRole", "groupIds"].includes(field),
    );
    if (unknownFields.length) {
      throw new Error(
        `Invalid permissions application at index ${index}: unknown field "${unknownFields[0]}"`,
      );
    }
    // Informational only; empty when the portal has no descriptor for the role.
    const clientIdentifier = record.clientIdentifier ?? "";
    if (
      typeof clientIdentifier !== "string" ||
      (clientIdentifier !== "" && !isVuuClientId(clientIdentifier.trim()))
    ) {
      throw new Error(`Invalid permissions[${index}].clientIdentifier`);
    }
    const accessRole = ensureRequiredNonEmptyString(
      record.accessRole,
      `permissions[${index}].accessRole`,
    );
    if (accessRoles.has(accessRole)) {
      throw new Error(`Duplicate permissions application role "${accessRole}"`);
    }
    accessRoles.add(accessRole);
    if (
      !Array.isArray(record.groupIds) ||
      record.groupIds.some(
        (groupId) => typeof groupId !== "string" || groupId.trim() === "",
      )
    ) {
      throw new Error(`Invalid permissions[${index}].groupIds`);
    }
    const groupIds = (record.groupIds as string[]).map((groupId) => groupId.trim());
    if (new Set(groupIds).size !== groupIds.length) {
      throw new Error(`Duplicate group ID in permissions application "${accessRole}"`);
    }
    return { clientIdentifier: clientIdentifier.trim(), accessRole, groupIds };
  });

  return normalizeUserModuleAccessPermissions(permissions);
}

function parseModuleAccessAssignments(value: unknown) {
  if (value === undefined) {
    throw new Error('Missing required RPC param "assignments"');
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error('Invalid RPC param "assignments"');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Invalid RPC param "assignments": expected JSON array');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Invalid RPC param "assignments": expected JSON array');
  }

  const assignmentKeys = new Set<string>();
  return parsed.map((assignment, index) => {
    if (typeof assignment !== "object" || assignment === null || Array.isArray(assignment)) {
      throw new Error(`Invalid module access assignment at index ${index}`);
    }
    const record = assignment as Record<string, unknown>;
    const accessRole = ensureRequiredNonEmptyString(
      record.accessRole,
      `assignments[${index}].accessRole`,
    );
    const groupId = ensureRequiredNonEmptyString(
      record.groupId,
      `assignments[${index}].groupId`,
    );
    // A user may hold several groups for one access role; only exact
    // duplicates are rejected.
    const assignmentKey = `${accessRole}\u0000${groupId}`;
    if (assignmentKeys.has(assignmentKey)) {
      throw new Error(
        `Duplicate module access assignment: ${accessRole} -> ${groupId}`,
      );
    }
    assignmentKeys.add(assignmentKey);
    return { accessRole, groupId };
  });
}
