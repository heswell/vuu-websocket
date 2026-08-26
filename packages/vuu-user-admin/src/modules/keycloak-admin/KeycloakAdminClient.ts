import { ConfigFactory } from "@heswell/vuu-server";

export const SEEDED_USERNAMES = [
  "trader1",
  "trader2",
  "admin",
] as const;

export const SEEDED_ROLE_NAMES = [
  "basket.view",
  "basket.trade",
  "modules.view",
  "modules.edit",
  "users.view",
  "users.admin",
] as const;

export const SEEDED_GROUP_NAMES = [
  "BASKET_VIEW",
  "BASKET_TRADE",
  "MODULES_ADMIN",
  "USERS_VIEW",
  "USERS_ADMIN",
] as const;

type TokenResponse = { access_token?: string };

type BunFetchInit = RequestInit & {
  tls?: {
    rejectUnauthorized?: boolean;
  };
};

type KeycloakUser = {
  id: string;
  username: string;
  email?: string;
  enabled?: boolean;
};

type KeycloakGroup = {
  id: string;
  name: string;
  path?: string;
};

type KeycloakRole = {
  id: string;
  name: string;
  description?: string;
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

type UserRef = {
  userId?: string;
  username?: string;
};

type GroupRef = {
  groupId?: string;
  groupName?: string;
};

type RoleRef = {
  roleId?: string;
  roleName?: string;
};

type AddUserParams = {
  username: string;
  email?: string;
  enabled?: boolean;
};

type AddRoleParams = {
  name: string;
  description?: string;
};

type AddGroupParams = {
  name: string;
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
    if (clientSecret) {
      body.set("client_secret", clientSecret);
    }

    const response = await keycloakFetch(
      `${baseUrl}/realms/${encodeURIComponent(adminRealm)}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
      allowSelfSignedCert,
    );

    if (!response.ok) {
      throw new Error(
        `Keycloak auth failed: ${response.status} ${response.statusText}`,
      );
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

  async addUser({ username, email, enabled = true }: AddUserParams) {
    await this.requestNoContent(this.realmUrl("/users"), {
      method: "POST",
      body: JSON.stringify({
        username,
        email,
        enabled,
      }),
      expectedStatuses: [201, 204],
    });
  }

  async addRole({ name, description = "" }: AddRoleParams) {
    await this.requestNoContent(this.realmUrl("/roles"), {
      method: "POST",
      body: JSON.stringify({
        name,
        description,
      }),
      expectedStatuses: [201, 204],
    });
  }

  async addGroup({ name }: AddGroupParams) {
    await this.requestNoContent(this.realmUrl("/groups"), {
      method: "POST",
      body: JSON.stringify({ name }),
      expectedStatuses: [201, 204],
    });
  }

  async addRoleToGroup(groupRef: GroupRef, roleRef: RoleRef) {
    const group = await this.resolveGroup(groupRef);
    const role = await this.resolveRole(roleRef);
    await this.requestNoContent(
      this.realmUrl(`/groups/${encodeURIComponent(group.id)}/role-mappings/realm`),
      {
        method: "POST",
        body: JSON.stringify([
          {
            id: role.id,
            name: role.name,
            description: role.description ?? "",
          },
        ]),
        expectedStatuses: [204],
      },
    );
  }

  async addUserToGroup(userRef: UserRef, groupRef: GroupRef) {
    const user = await this.resolveUser(userRef);
    const group = await this.resolveGroup(groupRef);
    await this.requestNoContent(
      this.realmUrl(
        `/users/${encodeURIComponent(user.id)}/groups/${encodeURIComponent(group.id)}`,
      ),
      {
        method: "PUT",
        expectedStatuses: [204],
      },
    );
  }

  async listSeedUsers() {
    const users = await Promise.all(
      SEEDED_USERNAMES.map((username) => this.findUserByUsername(username)),
    );
    return users.filter((user): user is KeycloakUser => user !== undefined);
  }

  async listSeedGroups() {
    const groups = await this.requestJson<KeycloakGroup[]>(
      this.realmUrl("/groups?briefRepresentation=true&max=200"),
    );
    const wanted = new Set(SEEDED_GROUP_NAMES);
    return groups.filter((group) => wanted.has(group.name as (typeof SEEDED_GROUP_NAMES)[number]));
  }

  async listSeedRoles() {
    const roles = await this.requestJson<KeycloakRole[]>(this.realmUrl("/roles"));
    const wanted = new Set(SEEDED_ROLE_NAMES);
    return roles.filter((role) => wanted.has(role.name as (typeof SEEDED_ROLE_NAMES)[number]));
  }

  async listGroupNamesForUser(userId: string) {
    const groups = await this.listGroupsForUser(userId);
    return groups.map((group) => group.name).sort();
  }

  async listRoleNamesForGroup(groupId: string) {
    const roles = await this.listRolesForGroup(groupId);
    return roles.map((role) => role.name).sort();
  }

  async listGroupsForUser(userId: string) {
    return this.requestJson<KeycloakGroup[]>(
      this.realmUrl(`/users/${encodeURIComponent(userId)}/groups?briefRepresentation=true&max=200`),
    );
  }

  async listRolesForGroup(groupId: string) {
    return this.requestJson<KeycloakRole[]>(
      this.realmUrl(`/groups/${encodeURIComponent(groupId)}/role-mappings/realm`),
    );
  }

  private async resolveUser({ userId, username }: UserRef) {
    if (userId) {
      return this.requestJson<KeycloakUser>(
        this.realmUrl(`/users/${encodeURIComponent(userId)}`),
      );
    }

    if (!username) {
      throw new Error("Expected userId or username");
    }

    const user = await this.findUserByUsername(username);
    if (!user) {
      throw new Error(`Keycloak user not found: ${username}`);
    }
    return user;
  }

  private async resolveGroup({ groupId, groupName }: GroupRef) {
    if (groupId) {
      return this.requestJson<KeycloakGroup>(
        this.realmUrl(`/groups/${encodeURIComponent(groupId)}`),
      );
    }

    if (!groupName) {
      throw new Error("Expected groupId or groupName");
    }

    const groups = await this.requestJson<KeycloakGroup[]>(
      this.realmUrl(
        `/groups?search=${encodeURIComponent(groupName)}&briefRepresentation=true&max=200`,
      ),
    );
    const group = groups.find((candidate) => candidate.name === groupName);
    if (!group) {
      throw new Error(`Keycloak group not found: ${groupName}`);
    }
    return group;
  }

  private async resolveRole({ roleId, roleName }: RoleRef) {
    if (roleId) {
      const allRoles = await this.requestJson<KeycloakRole[]>(this.realmUrl("/roles"));
      const role = allRoles.find((candidate) => candidate.id === roleId);
      if (!role) {
        throw new Error(`Keycloak role not found for id: ${roleId}`);
      }
      return role;
    }

    if (!roleName) {
      throw new Error("Expected roleId or roleName");
    }

    return this.requestJson<KeycloakRole>(
      this.realmUrl(`/roles/${encodeURIComponent(roleName)}`),
    );
  }

  private async findUserByUsername(username: string) {
    const users = await this.requestJson<KeycloakUser[]>(
      this.realmUrl(
        `/users?username=${encodeURIComponent(username)}&exact=true&briefRepresentation=true`,
      ),
    );
    return users[0];
  }

  private realmUrl(path: string) {
    return `${this.baseUrl}/admin/realms/${encodeURIComponent(this.realm)}${path}`;
  }

  private async assertRealmExists() {
    const response = await keycloakFetch(
      this.realmUrl(""),
      {
        headers: this.headers,
      },
      this.allowSelfSignedCert,
    );

    if (response.status === 404) {
      throw new Error(`Keycloak realm not found: ${this.realm}`);
    }

    if (!response.ok) {
      throw new Error(
        `Unable to access realm ${this.realm}: ${response.status} ${response.statusText}`,
      );
    }
  }

  private async requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await keycloakFetch(
      url,
      {
        ...init,
        headers: {
          ...this.headers,
          ...(init.headers ?? {}),
        },
      },
      this.allowSelfSignedCert,
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Keycloak request failed for ${url}: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`,
      );
    }

    return (await response.json()) as T;
  }

  private async requestNoContent(
    url: string,
    options: {
      body?: string;
      expectedStatuses: number[];
      method: "POST" | "PUT" | "DELETE";
    },
  ) {
    const response = await keycloakFetch(
      url,
      {
        method: options.method,
        body: options.body,
        headers: {
          ...this.headers,
        },
      },
      this.allowSelfSignedCert,
    );

    if (!options.expectedStatuses.includes(response.status)) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Keycloak request failed for ${url}: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`,
      );
    }
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }
}

function keycloakFetch(
  url: string,
  init: RequestInit,
  allowSelfSignedCert: boolean,
) {
  const requestInit: BunFetchInit = { ...init };
  if (url.startsWith("https://") && allowSelfSignedCert) {
    requestInit.tls = {
      ...(requestInit.tls ?? {}),
      rejectUnauthorized: false,
    };
  }

  return fetch(url, requestInit);
}
