import {
  CreateSessionTableRpcHandler,
  type RpcParams,
  type TableContainer,
} from "@heswell/vuu-server";
import { RpcResult } from "@vuu-ui/vuu-protocol-types";
import { KeycloakAdminClient } from "../KeycloakAdminClient";
import { getKeycloakAdminRefreshCoordinator } from "../KeycloakAdminRefreshCoordinator";

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

export class KeycloakAdminService extends CreateSessionTableRpcHandler {
  constructor(
    tableContainer: TableContainer,
    private readonly createClient: () => Promise<KeycloakAdminClient> =
      KeycloakAdminClient.createFromConfig,
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
      const client = await this.createClient();
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
        if (!user) throw new Error(`Keycloak user not found after creation: ${username}`);
        await client.syncUserGroups(user.id, group_ids);
      }
      await this.refreshFromKeycloak("rpc:addUser");
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
      const client = await this.createClient();
      if (Object.keys(update).length) {
        await client.updateUser({ userId, ...update });
      }
      if (group_ids !== undefined) {
        await client.syncUserGroups(userId, group_ids);
      }
      await this.refreshFromKeycloak("rpc:updateUser");
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly deleteUser = async ({ namedParams }: RpcParams<Params>) => {
    try {
      const userId = ensureRequiredNonEmptyString(namedParams.userId, "userId");
      await (await this.createClient()).deleteUser(userId);
      await this.refreshFromKeycloak("rpc:deleteUser");
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly addGroup = async ({ namedParams }: RpcParams<Params>) => {
    try {
      const name = ensureRequiredNonEmptyString(namedParams.name, "name");
      await (await this.createClient()).addGroup({ name });
      await this.refreshFromKeycloak("rpc:addGroup");
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly updateGroup = async ({ namedParams }: RpcParams<Params>) => {
    try {
      const groupId = ensureRequiredNonEmptyString(namedParams.groupId, "groupId");
      const name = ensureRequiredNonEmptyString(namedParams.name, "name");
      await (await this.createClient()).updateGroup(groupId, { name });
      await this.refreshFromKeycloak("rpc:updateGroup");
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly deleteGroup = async ({ namedParams }: RpcParams<Params>) => {
    try {
      const groupId = ensureRequiredNonEmptyString(namedParams.groupId, "groupId");
      await (await this.createClient()).deleteGroup(groupId);
      await this.refreshFromKeycloak("rpc:deleteGroup");
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly addClient = async ({ namedParams }: RpcParams<Params>) => {
    try {
      const clientId = ensureRequiredNonEmptyString(namedParams.clientId, "clientId");
      const name = getOptionalNonEmptyString(namedParams.name, "name");
      const description = getOptionalNonEmptyString(namedParams.description, "description");
      const enabled = getOptionalBoolean(namedParams.enabled, "enabled") ?? true;
      await (await this.createClient()).addClient({ clientId, name, description, enabled });
      await this.refreshFromKeycloak("rpc:addClient");
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly updateClient = async ({ namedParams }: RpcParams<Params>) => {
    try {
      const clientId = ensureRequiredNonEmptyString(namedParams.clientId, "clientId");
      const changes = {
        name: getOptionalNonEmptyString(namedParams.name, "name"),
        description: getOptionalNonEmptyString(namedParams.description, "description"),
        enabled: getOptionalBoolean(namedParams.enabled, "enabled"),
      };
      const update = Object.fromEntries(
        Object.entries(changes).filter(([, value]) => value !== undefined),
      );
      if (!Object.keys(update).length) throw new Error("No client fields supplied");
      await (await this.createClient()).updateClient(clientId, update);
      await this.refreshFromKeycloak("rpc:updateClient");
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly addRole = async ({ namedParams }: RpcParams<Params>) => {
    try {
      const name = ensureRequiredNonEmptyString(namedParams.name, "name");
      const description = getOptionalNonEmptyString(namedParams.description, "description") ?? "";
      await (await this.createClient()).addRole({ name, description });
      await this.refreshFromKeycloak("rpc:addRole");
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly addClientRole = async ({ namedParams }: RpcParams<Params>) => {
    try {
      const clientId = ensureRequiredNonEmptyString(namedParams.clientId, "clientId");
      const name = ensureRequiredNonEmptyString(namedParams.name, "name");
      const description = getOptionalNonEmptyString(namedParams.description, "description") ?? "";
      await (await this.createClient()).addClientRole({ clientKey: clientId }, { name, description });
      await this.refreshFromKeycloak("rpc:addClientRole");
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
      const client = await this.createClient();
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
      await this.refreshFromKeycloak("rpc:updateRole");
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

  private async mutateRelationship(
    namedParams: Params,
    reason: string,
    mutate: (
      client: KeycloakAdminClient,
      group: { groupId?: string; groupName?: string },
      role: { roleId?: string; roleName?: string },
      clientKey?: string,
    ) => Promise<void>,
  ) {
    try {
      const groupRef = getRequiredEntityRef(namedParams, "groupId", "groupName");
      const roleRef = getRequiredEntityRef(namedParams, "roleId", "roleName");
      const clientKey = getOptionalNonEmptyString(namedParams.clientId, "clientId");
      const client = await this.createClient();
      await mutate(
        client,
        { groupId: groupRef.id, groupName: groupRef.key },
        { roleId: roleRef.id, roleName: roleRef.key },
        clientKey,
      );
      await this.refreshFromKeycloak(`rpc:${reason}`);
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  }

  private async mutateUserGroup(
    namedParams: Params,
    reason: string,
    mutate: (
      client: KeycloakAdminClient,
      user: { userId?: string; username?: string },
      group: { groupId?: string; groupName?: string },
    ) => Promise<void>,
  ) {
    try {
      const userRef = getRequiredEntityRef(namedParams, "userId", "username");
      const groupRef = getRequiredEntityRef(namedParams, "groupId", "groupName");
      const client = await this.createClient();
      await mutate(
        client,
        { userId: userRef.id, username: userRef.key },
        { groupId: groupRef.id, groupName: groupRef.key },
      );
      await this.refreshFromKeycloak(`rpc:${reason}`);
      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  }

  private async refreshFromKeycloak(reason: string) {
    const coordinator = getKeycloakAdminRefreshCoordinator();
    if (!coordinator) throw new Error("Keycloak admin refresh coordinator is not configured");
    await coordinator.refreshAll(reason);
  }
}
