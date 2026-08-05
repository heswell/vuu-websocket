import { VuuUser, VuuUserWithAuthorizations } from "../../core/auths/VuuUser";
import { Config, ConfigFactory } from "../../util/ConfigFactory";
import { BearerTokenAuthProvider } from "./AuthProvider";
import { AuthenticationUnavailableError } from "./AuthenticationErrors";

const KeycloakAuthConfigKeys = {
  url: "vuu.keycloak.url",
  realm: "vuu.keycloak.realm",
  clientId: "vuu.auth.keycloak.clientId",
  clientSecret: "vuu.auth.keycloak.clientSecret",
  audience: "vuu.auth.keycloak.audience",
  audiencePolicy: "vuu.auth.keycloak.audiencePolicy",
  tokenExchangeEnabled: "vuu.auth.keycloak.tokenExchangeEnabled",
  allowSelfSignedCert: "vuu.keycloak.allowSelfSignedCert",
} as const;

export type KeycloakAudiencePolicy =
  | "require-audience"
  | "exchange-if-needed"
  | "always-exchange";

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
  aud?: string | string[];
  preferred_username?: string;
  username?: string;
  exp?: number;
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
  groups?: string[];
};

export class KeycloakAuthProvider implements BearerTokenAuthProvider {
  private readonly baseUrl: string;
  private readonly realm: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly audience: string;
  private readonly audiencePolicy: KeycloakAudiencePolicy;
  private readonly tokenExchangeEnabled: boolean;
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
    this.audience = config.getString(
      KeycloakAuthConfigKeys.audience,
      this.clientId,
    );
    this.audiencePolicy = parseAudiencePolicy(
      config.getString(
        KeycloakAuthConfigKeys.audiencePolicy,
        "require-audience",
      ),
    );
    this.tokenExchangeEnabled = config.getBoolean(
      KeycloakAuthConfigKeys.tokenExchangeEnabled,
      false,
    );
    this.allowSelfSignedCert = config.getBoolean(
      KeycloakAuthConfigKeys.allowSelfSignedCert,
      false,
    );

    if (
      this.audiencePolicy !== "require-audience" &&
      !this.tokenExchangeEnabled
    ) {
      throw new Error(
        `${this.audiencePolicy} requires ${KeycloakAuthConfigKeys.tokenExchangeEnabled}=true`,
      );
    }
    if (this.tokenExchangeEnabled && !this.clientSecret) {
      throw new Error("Keycloak token exchange requires a client secret");
    }
  }

  async authenticateBearerToken(token: string): Promise<VuuUser> {
    const subjectPayload = await this.introspect(token);
    this.validateIdentity(subjectPayload);
    const shouldExchange =
      this.audiencePolicy === "always-exchange" ||
      (this.audiencePolicy === "exchange-if-needed" &&
        !hasAudience(subjectPayload, this.audience));
    console.log(`should exchange ${shouldExchange}`)
    if (shouldExchange) {
      const exchangedToken = await this.exchangeToken(token);
      const exchangedPayload = await this.introspect(exchangedToken);
      this.validateIdentity(exchangedPayload);
      this.requireAudience(exchangedPayload);
      return this.createVuuUser(exchangedPayload);
    }

    this.requireAudience(subjectPayload);
    return this.createVuuUser(subjectPayload);
  }

  private async introspect(token: string): Promise<KeycloakTokenPayload> {
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
      if (response.status >= 500) {
        throw new AuthenticationUnavailableError(
          "Keycloak token validation is unavailable",
        );
      }
      throw new Error(
        `Keycloak token validation failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as KeycloakTokenPayload;
    if (!payload.active) {
      throw new Error("Keycloak token is inactive");
    }
    return payload;
  }

  private async exchangeToken(subjectToken: string): Promise<string> {
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: subjectToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      audience: this.audience,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    const response = await this.keycloakFetch(
      `${this.baseUrl}/realms/${encodeURIComponent(this.realm)}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      },
    );
    if (!response.ok) {
      if (response.status >= 500) {
        throw new AuthenticationUnavailableError(
          "Keycloak token exchange is unavailable",
        );
      }
      throw new Error(
        `Keycloak token exchange failed: ${response.status} ${response.statusText}`,
      );
    }

    const token = (await response.json()) as KeycloakTokenResponse;
    if (!token.access_token) {
      throw new Error("Keycloak token exchange did not include access_token");
    }
    return token.access_token;
  }

  private validateIdentity(payload: KeycloakTokenPayload) {
    if (!payload.preferred_username && !payload.username) {
      throw new Error("Keycloak token did not include a username");
    }
    if (!payload.exp || payload.exp * 1000 <= Date.now()) {
      throw new Error("Keycloak token is expired or has no expiry");
    }
  }

  private requireAudience(payload: KeycloakTokenPayload) {
    if (!hasAudience(payload, this.audience)) {
      console.log(`Keycloak token is not scoped to audience '${this.audience}'`)
      throw new Error(
        `Keycloak token is not scoped to audience '${this.audience}'`,
      );
    }
  }

  private async keycloakFetch(url: string, init: RequestInit) {
    const requestInit: BunFetchInit = { ...init };
    if (url.startsWith("https://") && this.allowSelfSignedCert) {
      requestInit.tls = {
        ...(requestInit.tls ?? {}),
        rejectUnauthorized: false,
      };
    }
    try {
      return await fetch(url, requestInit);
    } catch {
      throw new AuthenticationUnavailableError(
        "Keycloak authentication service is unavailable",
      );
    }
  }

  private createVuuUser(payload: KeycloakTokenPayload) {
    const username = payload.preferred_username ?? payload.username;
    if (!username) {
      throw new Error("Keycloak token did not include a username");
    }

    return VuuUserWithAuthorizations(
      username,
      extractAuthorizations(payload),
      new Date(payload.exp! * 1000),
    );
  }
}

function parseAudiencePolicy(value: string): KeycloakAudiencePolicy {
  if (
    value === "require-audience" ||
    value === "exchange-if-needed" ||
    value === "always-exchange"
  ) {
    return value;
  }
  throw new Error(
    `Unsupported Keycloak audience policy '${value}'. Expected 'require-audience', 'exchange-if-needed', or 'always-exchange'.`,
  );
}

function hasAudience(payload: KeycloakTokenPayload, audience: string) {
  const audiences = Array.isArray(payload.aud)
    ? payload.aud
    : payload.aud
      ? [payload.aud]
      : [];
  return audiences.includes(audience);
}

function extractAuthorizations(payload: KeycloakTokenPayload): string[] {
  const clientRoles = Object.values(payload.resource_access ?? {}).flatMap(
    ({ roles }) => roles ?? [],
  );
  return Array.from(
    new Set([
      ...(payload.realm_access?.roles ?? []),
      ...clientRoles,
      ...(payload.groups ?? []),
    ]),
  );
}
