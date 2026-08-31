import { VuuUser, VuuUserWithAuthorizations } from "../../core/auths/VuuUser";
import { Config, ConfigFactory } from "../../util/ConfigFactory";
import { BearerTokenAuthProvider } from "./AuthProvider";
import {
  AuthenticationError,
  AuthenticationUnavailableError,
} from "./AuthenticationErrors";
import { resolveKeycloakClientSecret } from "./KeycloakClientSecrets";

const KeycloakAuthConfigKeys = {
  url: "vuu.keycloak.url",
  realm: "vuu.keycloak.realm",
  clientId: "vuu.auth.keycloak.clientId",
  clientSecret: "vuu.auth.keycloak.clientSecret",
  audience: "vuu.auth.keycloak.audience",
  audiencePolicy: "vuu.auth.keycloak.audiencePolicy",
  authorizationClientId: "vuu.auth.keycloak.authorizationClientId",
  expectedAuthorizedParty: "vuu.auth.keycloak.expectedAuthorizedParty",
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
  azp?: string;
  sub?: string;
  preferred_username?: string;
  username?: string;
  exp?: number;
  resource_access?: Record<string, { roles?: string[] }>;
};

export type KeycloakAuthProviderOptions = {
  audience?: string;
  audiencePolicy?: KeycloakAudiencePolicy;
  authorizationClientId?: string;
  clientId?: string;
  clientSecret?: string;
  expectedAuthorizedParty?: string;
  tokenExchangeEnabled?: boolean;
};

export class KeycloakAuthProvider implements BearerTokenAuthProvider {
  private readonly baseUrl: string;
  private readonly realm: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly audience: string;
  private readonly audiencePolicy: KeycloakAudiencePolicy;
  private readonly authorizationClientId: string;
  private readonly expectedAuthorizedParty?: string;
  private readonly tokenExchangeEnabled: boolean;
  private readonly allowSelfSignedCert: boolean;

  constructor(
    config: Config = ConfigFactory.load(),
    options: KeycloakAuthProviderOptions = {},
  ) {
    this.baseUrl = config
      .getString(KeycloakAuthConfigKeys.url, "http://localhost:8080")
      .replace(/\/$/, "");
    this.realm = config.getString(KeycloakAuthConfigKeys.realm, "vuu");
    this.clientId =
      options.clientId ??
      config.getString(KeycloakAuthConfigKeys.clientId, "vuu-portal-server");
    this.clientSecret = resolveKeycloakClientSecret(
      this.clientId,
      options.clientSecret ??
        config.getString(KeycloakAuthConfigKeys.clientSecret, ""),
    );
    this.audience =
      options.audience ??
      config.getString(KeycloakAuthConfigKeys.audience, this.clientId);
    this.audiencePolicy =
      options.audiencePolicy ??
      parseAudiencePolicy(
        config.getString(
          KeycloakAuthConfigKeys.audiencePolicy,
          "require-audience",
        ),
      );
    this.authorizationClientId =
      options.authorizationClientId ??
      config.getString(
        KeycloakAuthConfigKeys.authorizationClientId,
        this.audience,
      );
    this.expectedAuthorizedParty =
      options.expectedAuthorizedParty ??
      optionalConfigString(
        config,
        KeycloakAuthConfigKeys.expectedAuthorizedParty,
      );
    this.tokenExchangeEnabled =
      options.tokenExchangeEnabled ??
      config.getBoolean(KeycloakAuthConfigKeys.tokenExchangeEnabled, false);
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
    if (shouldExchange) {
      const exchangedToken = await this.exchangeToken(token);
      const exchangedPayload = await this.introspect(exchangedToken);
      this.validateIdentity(exchangedPayload);
      this.requireSameIdentity(subjectPayload, exchangedPayload);
      this.requireAudience(exchangedPayload);
      this.requireAuthorizedParty(exchangedPayload);
      return this.createVuuUser(exchangedPayload);
    }

    this.requireAudience(subjectPayload);
    this.requireAuthorizedParty(subjectPayload);
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
      throw new AuthenticationError(
        `Keycloak token validation failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as KeycloakTokenPayload;
    if (!payload.active) {
      throw new AuthenticationError("Keycloak token is inactive");
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
      throw new AuthenticationError(
        `Keycloak token exchange failed: ${response.status} ${response.statusText}`,
      );
    }

    const token = (await response.json()) as KeycloakTokenResponse;
    if (!token.access_token) {
      throw new AuthenticationError(
        "Keycloak token exchange did not include access_token",
      );
    }
    return token.access_token;
  }

  private validateIdentity(payload: KeycloakTokenPayload) {
    if (!payload.sub) {
      throw new AuthenticationError("Keycloak token did not include a subject");
    }
    if (!payload.preferred_username && !payload.username) {
      throw new AuthenticationError("Keycloak token did not include a username");
    }
    if (!payload.exp || payload.exp * 1000 <= Date.now()) {
      throw new AuthenticationError("Keycloak token is expired or has no expiry");
    }
  }

  private requireSameIdentity(
    subject: KeycloakTokenPayload,
    exchanged: KeycloakTokenPayload,
  ) {
    if (
      subject.sub !== exchanged.sub ||
      tokenUsername(subject) !== tokenUsername(exchanged)
    ) {
      throw new AuthenticationError(
        "Keycloak token exchange changed the authenticated subject",
      );
    }
  }

  private requireAudience(payload: KeycloakTokenPayload) {
    if (!hasAudience(payload, this.audience)) {
      throw new AuthenticationError(
        `Keycloak token is not scoped to audience '${this.audience}'`,
      );
    }
  }

  private requireAuthorizedParty(payload: KeycloakTokenPayload) {
    if (
      this.expectedAuthorizedParty &&
      payload.azp !== this.expectedAuthorizedParty
    ) {
      throw new AuthenticationError(
        `Keycloak token was not issued to authorized party '${this.expectedAuthorizedParty}'`,
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
      throw new AuthenticationError("Keycloak token did not include a username");
    }

    return VuuUserWithAuthorizations(
      username,
      extractAuthorizations(payload, this.authorizationClientId),
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

function extractAuthorizations(
  payload: KeycloakTokenPayload,
  authorizationClientId: string,
): string[] {
  return Array.from(
    new Set(payload.resource_access?.[authorizationClientId]?.roles ?? []),
  );
}

function tokenUsername(payload: KeycloakTokenPayload) {
  return payload.preferred_username ?? payload.username;
}

function optionalConfigString(config: Config, key: string) {
  const value = config.getString(key, "").trim();
  return value || undefined;
}
