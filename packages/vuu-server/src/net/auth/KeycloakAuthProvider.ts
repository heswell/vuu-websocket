import { VuuUser, VuuUserWithAuthorizations } from "../../core/auths/VuuUser";
import { Config, ConfigFactory } from "../../util/ConfigFactory";
import { AuthProvider } from "./AuthProvider";

const KeycloakAuthConfigKeys = {
  url: "vuu.keycloak.url",
  realm: "vuu.keycloak.realm",
  clientId: "vuu.auth.keycloak.clientId",
  clientSecret: "vuu.auth.keycloak.clientSecret",
  allowSelfSignedCert: "vuu.keycloak.allowSelfSignedCert",
} as const;

type BunFetchInit = RequestInit & {
  tls?: {
    rejectUnauthorized?: boolean;
  };
};

type KeycloakTokenResponse = {
  access_token?: string;
};

type KeycloakTokenPayload = {
  active?: boolean;
  preferred_username?: string;
  username?: string;
  exp?: number;
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
  groups?: string[];
};

export class KeycloakAuthProvider implements AuthProvider {
  private readonly baseUrl: string;
  private readonly realm: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly allowSelfSignedCert: boolean;

  constructor(config: Config = ConfigFactory.load()) {
    this.baseUrl = config
      .getString(KeycloakAuthConfigKeys.url, "http://localhost:8080")
      .replace(/\/$/, "");
    this.realm = config.getString(KeycloakAuthConfigKeys.realm, "vuu");
    this.clientId = config.getString(
      KeycloakAuthConfigKeys.clientId,
      "vuu-portal",
    );
    this.clientSecret = config.getString(
      KeycloakAuthConfigKeys.clientSecret,
      "",
    );
    this.allowSelfSignedCert = config.getBoolean(
      KeycloakAuthConfigKeys.allowSelfSignedCert,
      false,
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

    const response = await this.keycloakFetch(
      `${this.baseUrl}/realms/${encodeURIComponent(this.realm)}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
    const body = new URLSearchParams({ token, client_id: this.clientId });
    if (this.clientSecret) {
      body.set("client_secret", this.clientSecret);
    }

    const response = await this.keycloakFetch(
      `${this.baseUrl}/realms/${encodeURIComponent(this.realm)}/protocol/openid-connect/token/introspect`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
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

  private keycloakFetch(url: string, init: RequestInit) {
    const requestInit: BunFetchInit = { ...init };
    if (url.startsWith("https://") && this.allowSelfSignedCert) {
      requestInit.tls = {
        ...(requestInit.tls ?? {}),
        rejectUnauthorized: false,
      };
    }

    return fetch(url, requestInit);
  }

  private createVuuUser(payload: KeycloakTokenPayload, fallbackUsername?: string) {
    const username =
      payload.preferred_username ?? payload.username ?? fallbackUsername;
    if (!username) {
      throw new Error("Keycloak token did not include a username");
    }

    const expiry = payload.exp ? new Date(payload.exp * 1000) : undefined;
    return VuuUserWithAuthorizations(
      username,
      extractAuthorizations(payload, this.clientId),
      expiry,
    );
  }
}

function parseJwtPayload(jwt: string): KeycloakTokenPayload {
  const payload = jwt.split(".")[1];
  if (!payload) {
    throw new Error("Invalid JWT format");
  }

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as KeycloakTokenPayload;
  } catch {
    throw new Error("Unable to parse JWT payload");
  }
}

function extractAuthorizations(
  payload: KeycloakTokenPayload,
  clientId: string,
): string[] {
  return Array.from(
    new Set([
      ...(payload.realm_access?.roles ?? []),
      ...(payload.resource_access?.[clientId]?.roles ?? []),
      ...(payload.groups ?? []),
    ]),
  );
}
