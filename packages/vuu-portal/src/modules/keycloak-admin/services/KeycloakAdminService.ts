import { DefaultRpcHandler, type TableContainer } from "@heswell/vuu-server";
import { RpcResult } from "@vuu-ui/vuu-protocol-types";
import { RpcParams } from "@heswell/vuu-server/src/net/rpc/Rpc";
import { KeycloakAdminClient } from "../KeycloakAdminClient";
import { getKeycloakAdminRefreshCoordinator } from "../KeycloakAdminRefreshCoordinator";

type AddUserParams = {
  email?: string;
  enabled?: boolean;
  username?: string;
};

type AddRoleParams = {
  description?: string;
  name?: string;
};

type AddGroupParams = {
  name?: string;
};

type AddRoleToGroupParams = {
  groupId?: string;
  groupName?: string;
  roleId?: string;
  roleName?: string;
};

type AddUserToGroupParams = {
  groupId?: string;
  groupName?: string;
  userId?: string;
  username?: string;
};

const success = (data?: unknown): RpcResult => ({
  type: "SUCCESS_RESULT",
  data,
});

const failure = (errorMessage: string): RpcResult => ({
  type: "ERROR_RESULT",
  errorMessage,
});

const ensureRequiredNonEmptyString = (
  value: unknown,
  fieldName: string,
): string => {
  if (value === undefined) {
    throw new Error(`Missing required RPC param "${fieldName}"`);
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid RPC param "${fieldName}"`);
  }
  return value.trim();
};

const getOptionalNonEmptyString = (
  value: unknown,
  fieldName: string,
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  return ensureRequiredNonEmptyString(value, fieldName);
};

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export class KeycloakAdminService extends DefaultRpcHandler {
  constructor(tableContainer: TableContainer) {
    super(tableContainer);
    this.registerRpc("addUser", this.addUser);
    this.registerRpc("addRole", this.addRole);
    this.registerRpc("addGroup", this.addGroup);
    this.registerRpc("addRoleToGroup", this.addRoleToGroup);
    this.registerRpc("addUserToGroup", this.addUserToGroup);
  }

  private readonly addUser = async ({
    namedParams,
  }: RpcParams<AddUserParams>): Promise<RpcResult> => {
    try {
      const username = ensureRequiredNonEmptyString(
        namedParams.username,
        "username",
      );
      const email = getOptionalNonEmptyString(namedParams.email, "email");
      const enabled =
        typeof namedParams.enabled === "boolean" ? namedParams.enabled : true;

      const client = await KeycloakAdminClient.createFromConfig();
      await client.addUser({ username, email, enabled });
      await this.refreshFromKeycloak("rpc:addUser");

      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly addRole = async ({
    namedParams,
  }: RpcParams<AddRoleParams>): Promise<RpcResult> => {
    try {
      const name = ensureRequiredNonEmptyString(namedParams.name, "name");
      const description =
        getOptionalNonEmptyString(namedParams.description, "description") ?? "";

      const client = await KeycloakAdminClient.createFromConfig();
      await client.addRole({ name, description });
      await this.refreshFromKeycloak("rpc:addRole");

      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly addGroup = async ({
    namedParams,
  }: RpcParams<AddGroupParams>): Promise<RpcResult> => {
    try {
      const name = ensureRequiredNonEmptyString(namedParams.name, "name");

      const client = await KeycloakAdminClient.createFromConfig();
      await client.addGroup({ name });
      await this.refreshFromKeycloak("rpc:addGroup");

      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly addRoleToGroup = async ({
    namedParams,
  }: RpcParams<AddRoleToGroupParams>): Promise<RpcResult> => {
    try {
      const groupId = getOptionalNonEmptyString(namedParams.groupId, "groupId");
      const groupName = getOptionalNonEmptyString(
        namedParams.groupName,
        "groupName",
      );
      const roleId = getOptionalNonEmptyString(namedParams.roleId, "roleId");
      const roleName = getOptionalNonEmptyString(namedParams.roleName, "roleName");

      if (!groupId && !groupName) {
        throw new Error('Missing required RPC param "groupId" or "groupName"');
      }
      if (!roleId && !roleName) {
        throw new Error('Missing required RPC param "roleId" or "roleName"');
      }

      const client = await KeycloakAdminClient.createFromConfig();
      await client.addRoleToGroup({ groupId, groupName }, { roleId, roleName });
      await this.refreshFromKeycloak("rpc:addRoleToGroup");

      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private readonly addUserToGroup = async ({
    namedParams,
  }: RpcParams<AddUserToGroupParams>): Promise<RpcResult> => {
    try {
      const userId = getOptionalNonEmptyString(namedParams.userId, "userId");
      const username = getOptionalNonEmptyString(namedParams.username, "username");
      const groupId = getOptionalNonEmptyString(namedParams.groupId, "groupId");
      const groupName = getOptionalNonEmptyString(
        namedParams.groupName,
        "groupName",
      );

      if (!userId && !username) {
        throw new Error('Missing required RPC param "userId" or "username"');
      }
      if (!groupId && !groupName) {
        throw new Error('Missing required RPC param "groupId" or "groupName"');
      }

      const client = await KeycloakAdminClient.createFromConfig();
      await client.addUserToGroup({ userId, username }, { groupId, groupName });
      await this.refreshFromKeycloak("rpc:addUserToGroup");

      return success();
    } catch (error) {
      return failure(toErrorMessage(error));
    }
  };

  private async refreshFromKeycloak(reason: string) {
    const coordinator = getKeycloakAdminRefreshCoordinator();
    if (!coordinator) {
      throw new Error("Keycloak admin refresh coordinator is not configured");
    }
    await coordinator.refreshAll(reason);
  }
}
