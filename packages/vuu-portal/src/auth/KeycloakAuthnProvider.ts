import {
  AuthnProvider,
  VuuUser,
  VuuUserWithAuthorizations,
} from "@heswell/vuu-server";

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
  private readonly baseUrl = (process.env.KEYCLOAK_URL ?? "http://localhost:8080").replace(
    /\/$/,
    "",
  );

  private readonly realm = process.env.KEYCLOAK_REALM ?? "vuu";

  private readonly clientId = process.env.KEYCLOAK_CLIENT_ID ?? "portal";

  private readonly clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;

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
