import {
  CreateSessionTableRpcHandler,
  type RpcParams,
  type TableContainer,
} from "@heswell/vuu-server";
import { RpcResult } from "@vuu-ui/vuu-protocol-types";
import { assertVuuClientId, type UserAdminOperations } from "@heswell/user-admin";

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

export class UserAdminService extends CreateSessionTableRpcHandler {
  constructor(
    tableContainer: TableContainer,
    private readonly createOperations: () => Promise<UserAdminOperations>,
    private readonly refreshAfterMutation: (reason: string) => Promise<void>,
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

  const loginRoles = new Set<string>();
  return parsed.map((assignment, index) => {
    if (typeof assignment !== "object" || assignment === null || Array.isArray(assignment)) {
      throw new Error(`Invalid module access assignment at index ${index}`);
    }
    const record = assignment as Record<string, unknown>;
    const loginRole = ensureRequiredNonEmptyString(
      record.loginRole,
      `assignments[${index}].loginRole`,
    );
    const groupId = ensureRequiredNonEmptyString(
      record.groupId,
      `assignments[${index}].groupId`,
    );
    if (loginRoles.has(loginRole)) {
      throw new Error(`Duplicate module access assignment for role "${loginRole}"`);
    }
    loginRoles.add(loginRole);
    return { loginRole, groupId };
  });
}
