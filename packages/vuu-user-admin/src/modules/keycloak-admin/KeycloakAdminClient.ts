import { ConfigFactory } from "@heswell/vuu-server";

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
  realmRoles: KeycloakRole[];
  clientRoles: Array<{ client: KeycloakClient; role: KeycloakRole }>;
  userGroups: KeycloakUserGroup[];
  groupRoles: KeycloakGroupRole[];
  timestamp: number;
};

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
    const [realm, users, groups, clients, realmRoles] = await Promise.all([
      this.requestJson<KeycloakRealm>(this.realmUrl("")),
      this.listUsers(),
      this.listGroups(),
      this.listClients(),
      this.listRealmRoles(),
    ]);

    const clientRoles = (
      await Promise.all(
        clients.map(async (client) => {
          const roles = await this.listClientRoles(client.id);
          return roles.map((role) => ({ client, role }));
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
          const realmRolesForGroup = (await this.listRolesForGroup(group.id)).map((role) => ({
            group,
            role,
          }));
          const clientRolesForGroup = (
            await Promise.all(
              clients.map(async (client) => {
                const roles = await this.listClientRolesForGroup(group.id, client.id);
                return roles.map((role) => ({ group, role, client }));
              }),
            )
          ).flat();
          return [...realmRolesForGroup, ...clientRolesForGroup];
        }),
      )
    ).flat();

    return {
      realm,
      users,
      groups,
      clients,
      realmRoles,
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
    return topLevelGroups.flatMap((group) => flattenGroups(group));
  }

  async listClients() {
    return this.listPaginated<KeycloakClient>("/clients");
  }

  async listRealmRoles() {
    return this.listPaginated<KeycloakRole>("/roles");
  }

  async listClientRoles(clientId: string) {
    return this.listPaginated<KeycloakRole>(
      `/clients/${encodeURIComponent(clientId)}/roles`,
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

  async listClientRolesForGroup(groupId: string, clientId: string) {
    return this.requestJson<KeycloakRole[]>(
      this.realmUrl(
        `/groups/${encodeURIComponent(groupId)}/role-mappings/clients/${encodeURIComponent(clientId)}`,
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
    clientId: string,
    roleName: string,
    changes: Partial<AddRoleParams>,
  ) {
    const role = await this.requestJson<KeycloakRole>(
      this.realmUrl(
        `/clients/${encodeURIComponent(clientId)}/roles/${encodeURIComponent(roleName)}`,
      ),
    );
    await this.requestNoContent(
      this.realmUrl(
        `/clients/${encodeURIComponent(clientId)}/roles/${encodeURIComponent(roleName)}`,
      ),
      {
        method: "PUT",
        body: JSON.stringify({ ...role, ...changes }),
        expectedStatuses: [204],
      },
    );
  }

  async addClient({ clientId, name, description, enabled = true }: AddClientParams) {
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
    const client = await this.resolveClient({ clientKey: clientId });
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
      return this.requestJson<KeycloakClient>(
        this.realmUrl(`/clients/${encodeURIComponent(clientId)}`),
      );
    }
    if (!clientKey) throw new Error("Expected clientId or clientKey");
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
    const roles = await this.listClientRoles(client.id);
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

function flattenGroups(group: KeycloakGroup, parentId?: string): KeycloakGroup[] {
  const { subGroups = [], ...groupWithoutChildren } = group;
  const flattenedGroup = {
    ...groupWithoutChildren,
    ...(groupWithoutChildren.parentId || !parentId
      ? {}
      : { parentId }),
  };
  return [
    flattenedGroup,
    ...subGroups.flatMap((child) => flattenGroups(child, group.id)),
  ];
}

function keycloakFetch(url: string, init: RequestInit, allowSelfSignedCert: boolean) {
  const requestInit: BunFetchInit = { ...init };
  if (url.startsWith("https://") && allowSelfSignedCert) {
    requestInit.tls = { ...(requestInit.tls ?? {}), rejectUnauthorized: false };
  }
  return fetch(url, requestInit);
}
