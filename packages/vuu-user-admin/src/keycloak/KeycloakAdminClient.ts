import { ConfigFactory } from "@heswell/vuu-server";
import {
  assertVuuClientId,
  isVuuClientId,
  VUU_PORTAL_CLIENT_IDENTIFIER,
  type UserAdminUserEdit,
  type UserModuleAccessAssignment,
  type UserModuleAccessModule,
  type UserModuleAccessOptions,
} from "@heswell/user-admin";

export type KeycloakUser = {
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

export type KeycloakGroup = {
  id: string;
  name: string;
  path?: string;
  parentId?: string;
  createdTimestamp?: number;
  subGroups?: KeycloakGroup[];
};

export type KeycloakClient = {
  id: string;
  clientId: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  publicClient?: boolean;
  protocol?: string;
  createdTimestamp?: number;
};

export type KeycloakRole = {
  id: string;
  name: string;
  description?: string;
  clientRole?: boolean;
  containerId?: string;
  createdTimestamp?: number;
};

export type KeycloakRealm = {
  id?: string;
  realm: string;
  displayName?: string;
  enabled?: boolean;
};

export type UserRef = { userId?: string; username?: string };
export type GroupRef = { groupId?: string; groupName?: string };
export type RoleRef = { roleId?: string; roleName?: string };
export type ClientRef = { clientId?: string; clientKey?: string };

export type KeycloakUserGroup = {
  user: KeycloakUser;
  group: KeycloakGroup;
};

export type KeycloakGroupRole = {
  group: KeycloakGroup;
  role: KeycloakRole;
  client?: KeycloakClient;
};

export type KeycloakAdminSnapshot = {
  realm: KeycloakRealm;
  users: KeycloakUser[];
  groups: KeycloakGroup[];
  clients: KeycloakClient[];
  clientRoles: Array<{ client: KeycloakClient; role: KeycloakRole }>;
  userGroups: KeycloakUserGroup[];
  groupRoles: KeycloakGroupRole[];
  timestamp: number;
};

export function clientForRole(
  clients: KeycloakClient[],
  requestedClient: KeycloakClient,
  role: KeycloakRole,
) {
  if (!role.containerId) return requestedClient;
  return clients.find(({ id }) => id === role.containerId) ?? requestedClient;
}

type TokenResponse = { access_token?: string };
type BunFetchInit = RequestInit & {
  tls?: { rejectUnauthorized?: boolean };
};

const KeycloakConfigKeys = {
  url: "vuu.keycloak.url",
  realm: "vuu.keycloak.realm",
  adminRealm: "vuu.keycloak.adminRealm",
  adminUsername: "vuu.keycloak.adminUsername",
  adminPassword: "vuu.keycloak.adminPassword",
  clientId: "vuu.keycloak.clientId",
  clientSecret: "vuu.keycloak.clientSecret",
  allowSelfSignedCert: "vuu.keycloak.allowSelfSignedCert",
} as const;

type AddUserParams = {
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  emailVerified?: boolean;
  temporary_password?: string;
};
type UpdateUserParams = Partial<
  Pick<KeycloakUser, "username" | "email" | "firstName" | "lastName" | "enabled" | "emailVerified">
> & { userId: string; temporary_password?: string };
type AddRoleParams = { name: string; description?: string };
type AddGroupParams = { name: string };
type AddClientParams = {
  clientId: string;
  name?: string;
  description?: string;
  enabled?: boolean;
};

export class KeycloakAdminClient {
  private constructor(
    private readonly baseUrl: string,
    private readonly realm: string,
    private readonly token: string,
    private readonly allowSelfSignedCert: boolean,
  ) {}

  static async createFromConfig() {
    const config = ConfigFactory.load();
    const baseUrl = config
      .getString(KeycloakConfigKeys.url, "http://localhost:8080")
      .replace(/\/$/, "");
    const realm = config.getString(KeycloakConfigKeys.realm, "vuu");
    const adminRealm = config.getString(KeycloakConfigKeys.adminRealm, "master");
    const adminUsername = config.getString(KeycloakConfigKeys.adminUsername, "admin");
    const adminPassword = config.getString(KeycloakConfigKeys.adminPassword, "admin");
    const clientId = config.getString(KeycloakConfigKeys.clientId, "admin-cli");
    const clientSecret = config.getString(KeycloakConfigKeys.clientSecret, "");
    const allowSelfSignedCert = config.getBoolean(
      KeycloakConfigKeys.allowSelfSignedCert,
      false,
    );

    const body = new URLSearchParams({
      grant_type: "password",
      client_id: clientId,
      username: adminUsername,
      password: adminPassword,
    });
    if (clientSecret) body.set("client_secret", clientSecret);

    const response = await keycloakFetch(
      `${baseUrl}/realms/${encodeURIComponent(adminRealm)}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      },
      allowSelfSignedCert,
    );

    if (!response.ok) {
      throw new Error(`Keycloak auth failed: ${response.status} ${response.statusText}`);
    }
    const tokenResponse = (await response.json()) as TokenResponse;
    if (!tokenResponse.access_token) {
      throw new Error("Keycloak token response missing access_token");
    }

    const client = new KeycloakAdminClient(
      baseUrl,
      realm,
      tokenResponse.access_token,
      allowSelfSignedCert,
    );
    await client.assertRealmExists();
    return client;
  }

  async readSnapshot(): Promise<KeycloakAdminSnapshot> {
    const [realm, users, groups, clients] = await Promise.all([
      this.requestJson<KeycloakRealm>(this.realmUrl("")),
      this.listUsers(),
      this.listGroups(),
      this.listClients(),
    ]);

    const clientRoles = (
      await Promise.all(
        clients.map(async (client) => {
          const roles = await this.listClientRoles(client);
          return roles.map((role) => ({
            client: clientForRole(clients, client, role),
            role,
          }));
        }),
      )
    ).flat();

    const userGroups = (
      await Promise.all(
        users.map(async (user) => {
          const groupsForUser = await this.listGroupsForUser(user.id);
          return groupsForUser.map((group) => ({ user, group }));
        }),
      )
    ).flat();

    const groupRoles = (
      await Promise.all(
        groups.map(async (group) => {
          const clientRolesForGroup = (
            await Promise.all(
              clients.map(async (client) => {
                const roles = await this.listClientRolesForGroup(group.id, client);
                return roles.map((role) => ({
                  group,
                  role,
                  client: clientForRole(clients, client, role),
                }));
              }),
            )
          ).flat();
          return clientRolesForGroup;
        }),
      )
    ).flat();

    return {
      realm,
      users,
      groups,
      clients,
      clientRoles,
      userGroups,
      groupRoles: dedupeGroupRoles(groupRoles),
      timestamp: Date.now(),
    };
  }

  async listUsers() {
    return this.listPaginated<KeycloakUser>("/users?briefRepresentation=false");
  }

  async listGroups() {
    const topLevelGroups = await this.listPaginated<KeycloakGroup>(
      "/groups?briefRepresentation=true",
    );
    const flattenedGroups = await Promise.all(
      topLevelGroups.map((group) => this.flattenGroupTree(group)),
    );
    return flattenedGroups.flat();
  }

  async listClients() {
    const clients = await this.listPaginated<KeycloakClient>("/clients");
    return clients.filter(({ clientId }) => isVuuClientId(clientId));
  }

  async listRealmRoles() {
    return this.listPaginated<KeycloakRole>("/roles");
  }

  async listClientRoles(client: Pick<KeycloakClient, "id" | "clientId">) {
    assertVuuClientId(client.clientId);
    return this.listPaginated<KeycloakRole>(
      `/clients/${encodeURIComponent(client.id)}/roles`,
    );
  }

  async listGroupsForUser(userId: string) {
    return this.listPaginated<KeycloakGroup>(
      `/users/${encodeURIComponent(userId)}/groups?briefRepresentation=true`,
    );
  }

  async listRolesForGroup(groupId: string) {
    return this.requestJson<KeycloakRole[]>(
      this.realmUrl(`/groups/${encodeURIComponent(groupId)}/role-mappings/realm`),
    );
  }

  async listClientRolesForGroup(
    groupId: string,
    client: Pick<KeycloakClient, "id" | "clientId">,
  ) {
    assertVuuClientId(client.clientId);
    return this.requestJson<KeycloakRole[]>(
      this.realmUrl(
        `/groups/${encodeURIComponent(groupId)}/role-mappings/clients/${encodeURIComponent(client.id)}`,
      ),
    );
  }

  async addUser({
    username,
    email,
    firstName,
    lastName,
    enabled = true,
    emailVerified,
    temporary_password,
  }: AddUserParams) {
    await this.requestNoContent(this.realmUrl("/users"), {
      method: "POST",
      body: JSON.stringify({
        username,
        email,
        firstName,
        lastName,
        enabled,
        emailVerified,
        ...(temporary_password
          ? {
              credentials: [
                {
                  type: "password",
                  value: temporary_password,
                  temporary: true,
                },
              ],
            }
          : {}),
      }),
      expectedStatuses: [201, 204],
    });
  }

  async updateUser({ userId, ...changes }: UpdateUserParams) {
    const { temporary_password, ...userChanges } = changes;
    const user = await this.requestJson<KeycloakUser>(
      this.realmUrl(`/users/${encodeURIComponent(userId)}`),
    );
    await this.requestNoContent(this.realmUrl(`/users/${encodeURIComponent(userId)}`), {
      method: "PUT",
      body: JSON.stringify({ ...user, ...userChanges, id: userId }),
      expectedStatuses: [204],
    });
    if (temporary_password) {
      await this.setUserPassword(userId, temporary_password);
    }
  }

  async applyUserEdits(edits: readonly UserAdminUserEdit[]) {
    if (!edits.length) return;

    const snapshot = await this.readSnapshot();
    const plans = edits.map((edit) => {
      if (!snapshot.users.some(({ id }) => id === edit.userId)) {
        throw new Error(`Keycloak user not found: ${edit.userId}`);
      }
      return {
        edit,
        plan: edit.assignments === undefined
          ? undefined
          : planUserModuleAccessChanges(snapshot, edit.userId, edit.assignments),
      };
    });
    const originalUsers = new Map(
      snapshot.users.map((user) => [user.id, user]),
    );
    const rollbackGroups: Array<{
      userId: string;
      groupId: string;
      add: boolean;
    }> = [];
    const updatedUsers: KeycloakUser[] = [];

    try {
      for (const { edit, plan } of plans) {
        const user = originalUsers.get(edit.userId)!;
        if (Object.keys(edit.changes).length) {
          await this.updateUser({ userId: edit.userId, ...edit.changes });
          updatedUsers.push(user);
        }
        if (plan) {
          for (const groupId of plan.addGroupIds) {
            await this.addUserToGroup({ userId: edit.userId }, { groupId });
            rollbackGroups.push({ userId: edit.userId, groupId, add: false });
          }
          for (const groupId of plan.removeGroupIds) {
            await this.removeUserFromGroup({ userId: edit.userId }, { groupId });
            rollbackGroups.push({ userId: edit.userId, groupId, add: true });
          }
        }
      }
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      for (const rollback of rollbackGroups.reverse()) {
        try {
          if (rollback.add) {
            await this.addUserToGroup(
              { userId: rollback.userId },
              { groupId: rollback.groupId },
            );
          } else {
            await this.removeUserFromGroup(
              { userId: rollback.userId },
              { groupId: rollback.groupId },
            );
          }
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      for (const user of updatedUsers.reverse()) {
        try {
          await this.updateUser({
            userId: user.id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            enabled: user.enabled,
            emailVerified: user.emailVerified,
          });
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      if (rollbackErrors.length) {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}; ` +
          `rollback failed: ${rollbackErrors.map((rollbackError) =>
            rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          ).join("; ")}`,
        );
      }
      throw error;
    }
  }

  async setUserPassword(userId: string, password: string, temporary = true) {
    await this.requestNoContent(
      this.realmUrl(`/users/${encodeURIComponent(userId)}/reset-password`),
      {
        method: "PUT",
        body: JSON.stringify({ type: "password", value: password, temporary }),
        expectedStatuses: [204],
      },
    );
  }

  async findUserByUsername(username: string) {
    const users = await this.requestJson<KeycloakUser[]>(
      this.realmUrl(
        `/users?username=${encodeURIComponent(username)}&exact=true&briefRepresentation=false&max=100`,
      ),
    );
    return users[0];
  }

  async syncUserGroups(userId: string, groupIds: string[]) {
    const currentGroups = await this.listGroupsForUser(userId);
    const currentIds = new Set(currentGroups.map(({ id }) => id));
    const desiredIds = new Set(groupIds);
    await Promise.all(
      [...currentIds]
        .filter((groupId) => !desiredIds.has(groupId))
        .map((groupId) => this.removeUserFromGroup({ userId }, { groupId })),
    );
    await Promise.all(
      [...desiredIds]
        .filter((groupId) => !currentIds.has(groupId))
        .map((groupId) => this.addUserToGroup({ userId }, { groupId })),
    );
  }

  async getUserModuleAccessOptions(
    userId: string,
  ): Promise<UserModuleAccessOptions> {
    const snapshot = await this.readSnapshot();
    return buildUserModuleAccessOptions(snapshot, userId);
  }

  async setUserModuleAccess(
    userId: string,
    assignments: readonly UserModuleAccessAssignment[],
  ) {
    const snapshot = await this.readSnapshot();
    const plan = planUserModuleAccessChanges(snapshot, userId, assignments);
    await Promise.all([
      ...plan.removeGroupIds.map((groupId) =>
        this.removeUserFromGroup({ userId }, { groupId }),
      ),
      ...plan.addGroupIds.map((groupId) =>
        this.addUserToGroup({ userId }, { groupId }),
      ),
    ]);
  }

  async deleteUser(userId: string) {
    await this.requestNoContent(this.realmUrl(`/users/${encodeURIComponent(userId)}`), {
      method: "DELETE",
      expectedStatuses: [204],
    });
  }

  async addRole({ name, description = "" }: AddRoleParams) {
    await this.requestNoContent(this.realmUrl("/roles"), {
      method: "POST",
      body: JSON.stringify({ name, description }),
      expectedStatuses: [201, 204],
    });
  }

  async addClientRole(clientRef: ClientRef, { name, description = "" }: AddRoleParams) {
    const client = await this.resolveClient(clientRef);
    await this.requestNoContent(
      this.realmUrl(`/clients/${encodeURIComponent(client.id)}/roles`),
      {
        method: "POST",
        body: JSON.stringify({ name, description, clientRole: true, containerId: client.id }),
        expectedStatuses: [201, 204],
      },
    );
  }

  async updateRealmRole(roleId: string, changes: Partial<AddRoleParams>) {
    const role = await this.requestJson<KeycloakRole>(
      this.realmUrl(`/roles-by-id/${encodeURIComponent(roleId)}`),
    );
    await this.requestNoContent(this.realmUrl(`/roles-by-id/${encodeURIComponent(roleId)}`), {
      method: "PUT",
      body: JSON.stringify({ ...role, ...changes, id: roleId }),
      expectedStatuses: [204],
    });
  }

  async updateClientRole(
    clientIdentifier: string,
    roleName: string,
    changes: Partial<AddRoleParams>,
  ) {
    const client = await this.resolveClient({
      clientKey: assertVuuClientId(clientIdentifier),
    });
    const role = await this.requestJson<KeycloakRole>(
      this.realmUrl(
        `/clients/${encodeURIComponent(client.id)}/roles/${encodeURIComponent(roleName)}`,
      ),
    );
    await this.requestNoContent(
      this.realmUrl(
        `/clients/${encodeURIComponent(client.id)}/roles/${encodeURIComponent(roleName)}`,
      ),
      {
        method: "PUT",
        body: JSON.stringify({ ...role, ...changes }),
        expectedStatuses: [204],
      },
    );
  }

  async addClient({ clientId, name, description, enabled = true }: AddClientParams) {
    assertVuuClientId(clientId);
    await this.requestNoContent(this.realmUrl("/clients"), {
      method: "POST",
      body: JSON.stringify({
        clientId,
        name,
        description,
        enabled,
        protocol: "openid-connect",
      }),
      expectedStatuses: [201, 204],
    });
  }

  async updateClient(clientId: string, changes: Partial<AddClientParams>) {
    const client = await this.resolveClient({ clientKey: assertVuuClientId(clientId) });
    await this.requestNoContent(this.realmUrl(`/clients/${encodeURIComponent(client.id)}`), {
      method: "PUT",
      body: JSON.stringify({ ...client, ...changes }),
      expectedStatuses: [204],
    });
  }

  async addGroup({ name }: AddGroupParams) {
    await this.requestNoContent(this.realmUrl("/groups"), {
      method: "POST",
      body: JSON.stringify({ name }),
      expectedStatuses: [201, 204],
    });
  }

  async updateGroup(groupId: string, changes: Pick<AddGroupParams, "name">) {
    const group = await this.requestJson<KeycloakGroup>(
      this.realmUrl(`/groups/${encodeURIComponent(groupId)}`),
    );
    await this.requestNoContent(this.realmUrl(`/groups/${encodeURIComponent(groupId)}`), {
      method: "PUT",
      body: JSON.stringify({ ...group, ...changes, id: groupId }),
      expectedStatuses: [204],
    });
  }

  async deleteGroup(groupId: string) {
    await this.requestNoContent(this.realmUrl(`/groups/${encodeURIComponent(groupId)}`), {
      method: "DELETE",
      expectedStatuses: [204],
    });
  }

  async addRoleToGroup(groupRef: GroupRef, roleRef: RoleRef, clientRef?: ClientRef) {
    const group = await this.resolveGroup(groupRef);
    const role = clientRef
      ? await this.resolveClientRole(clientRef, roleRef)
      : await this.resolveRealmRole(roleRef);
    const path = clientRef
      ? `/groups/${encodeURIComponent(group.id)}/role-mappings/clients/${encodeURIComponent(
          (await this.resolveClient(clientRef)).id,
        )}`
      : `/groups/${encodeURIComponent(group.id)}/role-mappings/realm`;
    await this.requestNoContent(this.realmUrl(path), {
      method: "POST",
      body: JSON.stringify([role]),
      expectedStatuses: [204],
    });
  }

  async removeRoleFromGroup(groupRef: GroupRef, roleRef: RoleRef, clientRef?: ClientRef) {
    const group = await this.resolveGroup(groupRef);
    const role = clientRef
      ? await this.resolveClientRole(clientRef, roleRef)
      : await this.resolveRealmRole(roleRef);
    const path = clientRef
      ? `/groups/${encodeURIComponent(group.id)}/role-mappings/clients/${encodeURIComponent(
          (await this.resolveClient(clientRef)).id,
        )}`
      : `/groups/${encodeURIComponent(group.id)}/role-mappings/realm`;
    await this.requestNoContent(this.realmUrl(path), {
      method: "DELETE",
      body: JSON.stringify([role]),
      expectedStatuses: [204],
    });
  }

  async addUserToGroup(userRef: UserRef, groupRef: GroupRef) {
    const user = await this.resolveUser(userRef);
    const group = await this.resolveGroup(groupRef);
    await this.requestNoContent(
      this.realmUrl(
        `/users/${encodeURIComponent(user.id)}/groups/${encodeURIComponent(group.id)}`,
      ),
      { method: "PUT", expectedStatuses: [204] },
    );
  }

  async removeUserFromGroup(userRef: UserRef, groupRef: GroupRef) {
    const user = await this.resolveUser(userRef);
    const group = await this.resolveGroup(groupRef);
    await this.requestNoContent(
      this.realmUrl(
        `/users/${encodeURIComponent(user.id)}/groups/${encodeURIComponent(group.id)}`,
      ),
      { method: "DELETE", expectedStatuses: [204] },
    );
  }

  private async resolveUser({ userId, username }: UserRef) {
    if (userId) {
      return this.requestJson<KeycloakUser>(
        this.realmUrl(`/users/${encodeURIComponent(userId)}`),
      );
    }
    if (!username) throw new Error("Expected userId or username");
    const users = await this.requestJson<KeycloakUser[]>(
      this.realmUrl(`/users?username=${encodeURIComponent(username)}&exact=true&max=100`),
    );
    const user = users[0];
    if (!user) throw new Error(`Keycloak user not found: ${username}`);
    return user;
  }

  private async resolveGroup({ groupId, groupName }: GroupRef) {
    if (groupId) {
      return this.requestJson<KeycloakGroup>(
        this.realmUrl(`/groups/${encodeURIComponent(groupId)}`),
      );
    }
    if (!groupName) throw new Error("Expected groupId or groupName");
    const groups = await this.requestJson<KeycloakGroup[]>(
      this.realmUrl(`/groups?search=${encodeURIComponent(groupName)}&max=100`),
    );
    const group = groups.find((candidate) => candidate.name === groupName);
    if (!group) throw new Error(`Keycloak group not found: ${groupName}`);
    return group;
  }

  private async resolveClient({ clientId, clientKey }: ClientRef) {
    if (clientId) {
      const client = await this.requestJson<KeycloakClient>(
        this.realmUrl(`/clients/${encodeURIComponent(clientId)}`),
      );
      assertVuuClientId(client.clientId);
      return client;
    }
    if (!clientKey) throw new Error("Expected clientId or clientKey");
    assertVuuClientId(clientKey);
    const clients = await this.requestJson<KeycloakClient[]>(
      this.realmUrl(`/clients?clientId=${encodeURIComponent(clientKey)}&max=100`),
    );
    const client = clients.find((candidate) => candidate.clientId === clientKey);
    if (!client) throw new Error(`Keycloak client not found: ${clientKey}`);
    return client;
  }

  private async resolveRealmRole({ roleId, roleName }: RoleRef) {
    if (roleId) {
      const role = (await this.listRealmRoles()).find(
        (candidate) => candidate.id === roleId,
      );
      if (!role) throw new Error(`Keycloak role not found for id: ${roleId}`);
      return role;
    }
    if (!roleName) throw new Error("Expected roleId or roleName");
    return this.requestJson<KeycloakRole>(
      this.realmUrl(`/roles/${encodeURIComponent(roleName)}`),
    );
  }

  private async resolveClientRole(clientRef: ClientRef, roleRef: RoleRef) {
    const client = await this.resolveClient(clientRef);
    if (roleRef.roleName) {
      return this.requestJson<KeycloakRole>(
        this.realmUrl(
          `/clients/${encodeURIComponent(client.id)}/roles/${encodeURIComponent(roleRef.roleName)}`,
        ),
      );
    }
    const roles = await this.listClientRoles(client);
    const role = roles.find((candidate) => candidate.id === roleRef.roleId);
    if (!role) throw new Error(`Keycloak client role not found for id: ${roleRef.roleId}`);
    return role;
  }

  private async listPaginated<T>(path: string, pageSize = 100): Promise<T[]> {
    const result: T[] = [];
    for (let first = 0; ; first += pageSize) {
      const separator = path.includes("?") ? "&" : "?";
      const page = await this.requestJson<T[]>(
        this.realmUrl(`${path}${separator}first=${first}&max=${pageSize}`),
      );
      result.push(...page);
      if (page.length < pageSize) return result;
    }
  }

  private async flattenGroupTree(
    group: KeycloakGroup,
    parentId?: string,
  ): Promise<KeycloakGroup[]> {
    const flattenedGroup = {
      ...group,
      ...(group.parentId || !parentId ? {} : { parentId }),
    };
    delete flattenedGroup.subGroups;
    const children = await this.listPaginated<KeycloakGroup>(
      `/groups/${encodeURIComponent(group.id)}/children?briefRepresentation=true`,
    );
    const flattenedChildren = await Promise.all(
      children.map((child) => this.flattenGroupTree(child, group.id)),
    );
    return [flattenedGroup, ...flattenedChildren.flat()];
  }

  private realmUrl(path: string) {
    return `${this.baseUrl}/admin/realms/${encodeURIComponent(this.realm)}${path}`;
  }

  private async assertRealmExists() {
    const response = await keycloakFetch(
      this.realmUrl(""),
      { headers: this.headers },
      this.allowSelfSignedCert,
    );
    if (response.status === 404) throw new Error(`Keycloak realm not found: ${this.realm}`);
    if (!response.ok) {
      throw new Error(
        `Unable to access realm ${this.realm}: ${response.status} ${response.statusText}`,
      );
    }
  }

  private async requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await keycloakFetch(
      url,
      { ...init, headers: { ...this.headers, ...(init.headers ?? {}) } },
      this.allowSelfSignedCert,
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Keycloak request failed for ${url}: ${response.status} ${response.statusText}${
          body ? ` - ${body}` : ""
        }`,
      );
    }
    return (await response.json()) as T;
  }

  private async requestNoContent(
    url: string,
    options: { body?: string; expectedStatuses: number[]; method: "POST" | "PUT" | "DELETE" },
  ) {
    const response = await keycloakFetch(
      url,
      { method: options.method, body: options.body, headers: this.headers },
      this.allowSelfSignedCert,
    );
    if (!options.expectedStatuses.includes(response.status)) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Keycloak request failed for ${url}: ${response.status} ${response.statusText}${
          body ? ` - ${body}` : ""
        }`,
      );
    }
  }

  private get headers() {
    return { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" };
  }
}

function dedupeGroupRoles(roles: KeycloakGroupRole[]) {
  const seen = new Set<string>();
  return roles.filter(({ group, role, client }) => {
    const key = `${group.id}:${client?.id ?? "realm"}:${role.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildUserModuleAccessOptions(
  snapshot: KeycloakAdminSnapshot,
  userId: string,
): UserModuleAccessOptions {
  const user = snapshot.users.find(({ id }) => id === userId);
  if (!user) throw new Error(`Keycloak user not found: ${userId}`);

  const portalClient = snapshot.clients.find(
    ({ clientId }) => clientId === VUU_PORTAL_CLIENT_IDENTIFIER,
  );
  if (!portalClient) return { modules: [] };

  const userGroupIds = new Set(
    snapshot.userGroups
      .filter(({ user: candidate }) => candidate.id === userId)
      .map(({ group }) => group.id),
  );
  const groupsById = new Map(snapshot.groups.map((group) => [group.id, group]));
  const portalRoles = snapshot.clientRoles
    .filter(
      ({ client, role }) =>
        client.id === portalClient.id && role.name.endsWith("-access"),
    )
    .sort((left, right) => left.role.name.localeCompare(right.role.name));

  const modules = portalRoles.map(({ role }) => {
    const groups = snapshot.groupRoles
      .filter(
        ({ client, role: candidate }) =>
          client?.id === portalClient.id && candidate.id === role.id,
      )
      .map(({ group }) => group.id)
      .filter((groupId, index, groupIds) => groupIds.indexOf(groupId) === index)
      .map((groupId) => {
        const group = groupsById.get(groupId);
        if (!group) {
          throw new Error(`Keycloak group not found in snapshot: ${groupId}`);
        }
        const privilegeRoles = snapshot.groupRoles
          .filter(
            ({ group: candidate, client }) =>
              candidate.id === groupId &&
              client &&
              client.id !== portalClient.id,
          )
          .map(({ role: candidate }) => candidate.name)
          .filter((name, index, names) => names.indexOf(name) === index)
          .sort();
        const privilege = selectPrivilege(privilegeRoles);
        return {
          groupId: group.id,
          groupName: group.name,
          ...(group.path ? { groupPath: group.path } : {}),
          roleId: role.id,
          roleName: role.name,
          ...(privilege ? { privilege } : {}),
          isDefault: false,
        };
      })
      .sort(compareModuleAccessGroups);

    if (groups[0]) {
      const leastPrivilege = groups.reduce((current, candidate) =>
        privilegeCount(candidate) < privilegeCount(current) ? candidate : current,
      );
      leastPrivilege.isDefault = true;
    }

    const selectedGroupIds = groups
      .filter(({ groupId }) => userGroupIds.has(groupId))
      .map(({ groupId }) => groupId)
      .sort((left, right) => left.localeCompare(right));

    const module: UserModuleAccessModule = {
      clientIdentifier: portalClient.clientId,
      accessRole: role.name,
      groups,
      selectedGroupIds,
      ...(selectedGroupIds[0] ? { selectedGroupId: selectedGroupIds[0] } : {}),
    };
    return module;
  });

  return { modules };
}

type UserModuleAccessChangePlan = {
  addGroupIds: string[];
  removeGroupIds: string[];
};

export function planUserModuleAccessChanges(
  snapshot: KeycloakAdminSnapshot,
  userId: string,
  assignments: readonly UserModuleAccessAssignment[],
): UserModuleAccessChangePlan {
  const options = buildUserModuleAccessOptions(snapshot, userId);
  const modulesByRole = new Map(options.modules.map((module) => [module.accessRole, module]));
  const groupIds = new Set(snapshot.groups.map(({ id }) => id));
  const desiredGroupIds = new Set<string>();

  for (const assignment of assignments) {
    const module = modulesByRole.get(assignment.accessRole);
    if (!module) {
      throw new Error(`Unknown module access role: ${assignment.accessRole}`);
    }
    if (!groupIds.has(assignment.groupId)) {
      throw new Error(`Keycloak group not found: ${assignment.groupId}`);
    }
    if (!module.groups.some(({ groupId }) => groupId === assignment.groupId)) {
      throw new Error(
        `Group ${assignment.groupId} does not grant module access role ${assignment.accessRole}`,
      );
    }
    if (desiredGroupIds.has(assignment.groupId)) continue;
    desiredGroupIds.add(assignment.groupId);
  }

  const userGroupIds = new Set(
    snapshot.userGroups
      .filter(({ user }) => user.id === userId)
      .map(({ group }) => group.id),
  );
  const moduleGroupIds = new Set(
    options.modules.flatMap((module) => module.groups.map(({ groupId }) => groupId)),
  );
  const moduleRolesByGroup = new Map<string, Set<string>>();
  for (const module of options.modules) {
    for (const group of module.groups) {
      const roles = moduleRolesByGroup.get(group.groupId) ?? new Set<string>();
      roles.add(module.accessRole);
      moduleRolesByGroup.set(group.groupId, roles);
    }
  }
  for (const groupId of desiredGroupIds) {
    const roles = moduleRolesByGroup.get(groupId) ?? new Set<string>();
    const assignedRoles = new Set(
      assignments
        .filter(({ groupId: assignedGroupId }) => assignedGroupId === groupId)
        .map(({ accessRole }) => accessRole),
    );
    const omittedRole = [...roles].find((role) => !assignedRoles.has(role));
    if (omittedRole) {
      throw new Error(
        `Group ${groupId} also grants module access role ${omittedRole}; assign that module to the same group or choose another group`,
      );
    }
  }

  return {
    addGroupIds: [...desiredGroupIds].filter((groupId) => !userGroupIds.has(groupId)),
    removeGroupIds: [...moduleGroupIds].filter(
      (groupId) => userGroupIds.has(groupId) && !desiredGroupIds.has(groupId),
    ),
  };
}

function privilegeCount(group: { privilege?: string }) {
  return group.privilege && group.privilege !== "read" ? 1 : 0;
}

function selectPrivilege(privileges: string[]) {
  const elevatedPrivileges = privileges.filter((privilege) => privilege !== "read");
  return elevatedPrivileges.at(-1) ?? privileges[0];
}

function compareModuleAccessGroups(
  left: { groupPath?: string; groupName: string; groupId: string },
  right: { groupPath?: string; groupName: string; groupId: string },
) {
  return (
    (left.groupPath ?? left.groupName).localeCompare(right.groupPath ?? right.groupName) ||
    left.groupId.localeCompare(right.groupId)
  );
}

function keycloakFetch(url: string, init: RequestInit, allowSelfSignedCert: boolean) {
  const requestInit: BunFetchInit = { ...init };
  if (url.startsWith("https://") && allowSelfSignedCert) {
    requestInit.tls = { ...(requestInit.tls ?? {}), rejectUnauthorized: false };
  }
  return fetch(url, requestInit);
}
