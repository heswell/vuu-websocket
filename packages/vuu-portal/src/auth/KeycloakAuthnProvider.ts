import {
  AuthnProvider,
  Config,
  ConfigFactory,
  VuuUser,
  VuuUserWithAuthorizations,
} from "@heswell/vuu-server";

const KeycloakAuthnConfigKeys = {
  url: "vuu.keycloak.url",
  realm: "vuu.keycloak.realm",
  clientId: "vuu.auth.keycloak.clientId",
  clientSecret: "vuu.auth.keycloak.clientSecret",
} as const;

type KeycloakTokenResponse = {
  access_token?: string;
};

type KeycloakTokenPayload = {
  active?: boolean;
  preferred_username?: string;
  username?: string;
  exp?: number;
  realm_access?: {
    roles?: string[];
  };
  resource_access?: Record<string, { roles?: string[] }>;
  groups?: string[];
};

export class KeycloakAuthnProvider implements AuthnProvider {
  private readonly baseUrl: string;

  private readonly realm: string;

  private readonly clientId: string;

  private readonly clientSecret: string;

  constructor(config: Config = ConfigFactory.load()) {
    this.baseUrl = config
      .getString(KeycloakAuthnConfigKeys.url, "http://localhost:8080")
      .replace(/\/$/, "");
    this.realm = config.getString(KeycloakAuthnConfigKeys.realm, "vuu");
    this.clientId = config.getString(KeycloakAuthnConfigKeys.clientId, "portal");
    this.clientSecret = config.getString(
      KeycloakAuthnConfigKeys.clientSecret,
      "",
    );
  }

  async authenticate(username: string, password: string): Promise<VuuUser> {
    const body = new URLSearchParams({
      grant_type: "password",
      client_id: this.clientId,
      username,
      password,
    });

    if (this.clientSecret) {
      body.set("client_secret", this.clientSecret);
    }

    const response = await fetch(
      `${this.baseUrl}/realms/${encodeURIComponent(this.realm)}/protocol/openid-connect/token`,
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
        `Keycloak authentication failed: ${response.status} ${response.statusText}`,
      );
    }

    const token = (await response.json()) as KeycloakTokenResponse;
    if (!token.access_token) {
      throw new Error("Keycloak response did not include access_token");
    }

    return this.createVuuUser(parseJwtPayload(token.access_token), username);
  }

  async authenticateBearerToken(token: string): Promise<VuuUser> {
    const body = new URLSearchParams({
      token,
      client_id: this.clientId,
    });
    if (this.clientSecret) {
      body.set("client_secret", this.clientSecret);
    }

    const response = await fetch(
      `${this.baseUrl}/realms/${encodeURIComponent(this.realm)}/protocol/openid-connect/token/introspect`,
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
        `Keycloak token validation failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as KeycloakTokenPayload;
    if (!payload.active) {
      throw new Error("Keycloak token is inactive");
    }

    return this.createVuuUser(payload);
  }

  private createVuuUser(payload: KeycloakTokenPayload, fallbackUsername?: string) {
    const resolvedUser =
      payload.preferred_username ?? payload.username ?? fallbackUsername;
    if (!resolvedUser) {
      throw new Error("Keycloak token did not include a username");
    }

    const expiry = payload.exp ? new Date(payload.exp * 1000) : undefined;
    return VuuUserWithAuthorizations(
      resolvedUser,
      extractAuthorizations(payload, this.clientId),
      expiry,
    );
  }
}

function parseJwtPayload(jwt: string): KeycloakTokenPayload {
  const parts = jwt.split(".");
  if (parts.length < 2) {
    throw new Error("Invalid JWT format");
  }

  const payload = parts[1];
  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

  try {
    return JSON.parse(atob(padded)) as KeycloakTokenPayload;
  } catch {
    throw new Error("Unable to parse JWT payload");
  }
}

function extractAuthorizations(
  payload: KeycloakTokenPayload,
  clientId: string,
): string[] {
  const realmRoles = payload.realm_access?.roles ?? [];
  const clientRoles = payload.resource_access?.[clientId]?.roles ?? [];
  const groups = payload.groups ?? [];

  return Array.from(new Set([...realmRoles, ...clientRoles, ...groups]));
}
