import { ConfigFactory } from "@heswell/vuu-server";

export const SEEDED_USERNAMES = [
  "trader1",
  "trader2",
  "dev1",
  "dev2",
  "admin",
] as const;

export const SEEDED_ROLE_NAMES = [
  "basket.view",
  "basket.trade",
  "data.view",
  "users.view",
  "users.admin",
] as const;

export const SEEDED_GROUP_NAMES = [
  "BASKET_VIEW",
  "BASKET_TRADE",
  "DATA_VIEW",
  "USERS_VIEW",
  "USERS_ADMIN",
] as const;

type TokenResponse = { access_token?: string };

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
  adminUsername: "vuu.keycloak.adminUsername",
  adminPassword: "vuu.keycloak.adminPassword",
  clientId: "vuu.keycloak.clientId",
  clientSecret: "vuu.keycloak.clientSecret",
} as const;

export class KeycloakAdminClient {
  private constructor(
    private readonly baseUrl: string,
    private readonly realm: string,
    private readonly token: string,
  ) {}

  static async createFromConfig() {
    const config = ConfigFactory.load();
    const baseUrl = config
      .getString(KeycloakConfigKeys.url, "http://localhost:8080")
      .replace(/\/$/, "");
    const realm = config.getString(KeycloakConfigKeys.realm, "vuu");
    const adminUsername = config.getString(KeycloakConfigKeys.adminUsername, "admin");
    const adminPassword = config.getString(KeycloakConfigKeys.adminPassword, "admin");
    const clientId = config.getString(KeycloakConfigKeys.clientId, "admin-cli");
    const clientSecret = config.getString(KeycloakConfigKeys.clientSecret, "");

    const body = new URLSearchParams({
      grant_type: "password",
      client_id: clientId,
      username: adminUsername,
      password: adminPassword,
    });
    if (clientSecret) {
      body.set("client_secret", clientSecret);
    }

    const response = await fetch(
      `${baseUrl}/realms/master/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
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

    const client = new KeycloakAdminClient(baseUrl, realm, tokenResponse.access_token);
    await client.assertRealmExists();
    return client;
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
    const response = await fetch(this.realmUrl(""), {
      headers: this.headers,
    });

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
    const response = await fetch(url, {
      ...init,
      headers: {
        ...this.headers,
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Keycloak request failed for ${url}: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`,
      );
    }

    return (await response.json()) as T;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }
}
