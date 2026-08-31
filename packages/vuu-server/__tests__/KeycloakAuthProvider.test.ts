import { afterEach, describe, expect, test } from "bun:test";
import {
  AuthenticationError,
  AuthenticationUnavailableError,
} from "../src/net/auth/AuthenticationErrors";
import { KeycloakAuthProvider } from "../src/net/auth/KeycloakAuthProvider";
import { Config } from "../src/util/ConfigFactory";

type BunFetchInit = RequestInit & {
  tls?: { rejectUnauthorized?: boolean };
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("KeycloakAuthProvider", () => {
  test("extracts only roles owned by the configured authorization client", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(activeTokenResponse())) as typeof fetch;

    const user = await new KeycloakAuthProvider(
      createConfig(),
    ).authenticateBearerToken("keycloak-token");

    expect(user.name).toBe("keycloak-user");
    expect(user.authorizations).toEqual(["target-role"]);
  });

  test("returns no authorizations when the target client has no roles", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        activeTokenResponse({ resource_access: { "portal-client": {} } }),
      )) as typeof fetch;

    const user = await new KeycloakAuthProvider(
      createConfig(),
    ).authenticateBearerToken("keycloak-token");

    expect(user.authorizations).toEqual([]);
  });

  test("always exchanges even when the subject already has the target audience", async () => {
    const requests: Array<{ url: string; body: URLSearchParams }> = [];
    const responses = [
      activeTokenResponse(),
      Response.json({ access_token: "exchanged-token" }),
      activeTokenResponse(),
    ];
    globalThis.fetch = ((url, init) => {
      requests.push({
        url: String(url),
        body: init?.body as URLSearchParams,
      });
      return Promise.resolve(responses.shift()!);
    }) as typeof fetch;

    await new KeycloakAuthProvider(
      createConfig({
        audiencePolicy: "always-exchange",
        tokenExchangeEnabled: true,
      }),
    ).authenticateBearerToken("subject-token");

    expect(requests).toHaveLength(3);
    expect(requests[1].url).toEndWith("/token");
    expect([...requests[1].body.entries()]).toEqual([
      ["grant_type", "urn:ietf:params:oauth:grant-type:token-exchange"],
      ["subject_token", "subject-token"],
      [
        "subject_token_type",
        "urn:ietf:params:oauth:token-type:access_token",
      ],
      [
        "requested_token_type",
        "urn:ietf:params:oauth:token-type:access_token",
      ],
      ["audience", "portal-client"],
      ["client_id", "portal-client"],
      ["client_secret", "test-secret"],
    ]);
    expect(requests[2].body.get("token")).toBe("exchanged-token");
  });

  test("rejects exchanged tokens with a wrong or missing audience", async () => {
    for (const audience of ["other-client", undefined]) {
      const responses = [
        activeTokenResponse(),
        Response.json({ access_token: "exchanged-token" }),
        activeTokenResponse({ aud: audience }),
      ];
      globalThis.fetch = (() =>
        Promise.resolve(responses.shift()!)) as typeof fetch;

      await expect(
        new KeycloakAuthProvider(
          createConfig({
            audiencePolicy: "always-exchange",
            tokenExchangeEnabled: true,
          }),
        ).authenticateBearerToken("subject-token"),
      ).rejects.toThrow("not scoped to audience");
    }
  });

  test("rejects an exchanged token for a different subject or user", async () => {
    for (const exchanged of [
      activeTokenResponse({ sub: "different-subject" }),
      activeTokenResponse({ preferred_username: "different-user" }),
    ]) {
      const responses = [
        activeTokenResponse(),
        Response.json({ access_token: "exchanged-token" }),
        exchanged,
      ];
      globalThis.fetch = (() =>
        Promise.resolve(responses.shift()!)) as typeof fetch;

      await expect(
        new KeycloakAuthProvider(
          createConfig({
            audiencePolicy: "always-exchange",
            tokenExchangeEnabled: true,
          }),
        ).authenticateBearerToken("subject-token"),
      ).rejects.toThrow("changed the authenticated subject");
    }
  });

  test("enforces an expected authorized party on the authorized token", async () => {
    const responses = [
      activeTokenResponse(),
      Response.json({ access_token: "exchanged-token" }),
      activeTokenResponse({ azp: "unexpected-client" }),
    ];
    globalThis.fetch = (() =>
      Promise.resolve(responses.shift()!)) as typeof fetch;

    await expect(
      new KeycloakAuthProvider(
        createConfig({
          audiencePolicy: "always-exchange",
          expectedAuthorizedParty: "portal-client",
          tokenExchangeEnabled: true,
        }),
      ).authenticateBearerToken("subject-token"),
    ).rejects.toThrow("authorized party");
  });

  test("rejects inactive, expired, and subject-less tokens", async () => {
    for (const response of [
      Response.json({ active: false }),
      activeTokenResponse({ exp: Math.floor(Date.now() / 1000) - 1 }),
      activeTokenResponse({ sub: undefined }),
    ]) {
      globalThis.fetch = (() => Promise.resolve(response)) as typeof fetch;
      await expect(
        new KeycloakAuthProvider(createConfig()).authenticateBearerToken(
          "token",
        ),
      ).rejects.toThrow();
    }
  });

  test("distinguishes rejected credentials from unavailable Keycloak", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response(null, { status: 401 }))) as typeof fetch;
    await expect(
      new KeycloakAuthProvider(createConfig()).authenticateBearerToken("token"),
    ).rejects.toBeInstanceOf(AuthenticationError);

    globalThis.fetch = (() =>
      Promise.resolve(new Response(null, { status: 503 }))) as typeof fetch;
    await expect(
      new KeycloakAuthProvider(createConfig()).authenticateBearerToken("token"),
    ).rejects.toBeInstanceOf(AuthenticationUnavailableError);
  });

  test("distinguishes rejected exchange from unavailable exchange", async () => {
    for (const [status, errorType] of [
      [403, AuthenticationError],
      [503, AuthenticationUnavailableError],
    ] as const) {
      const responses = [
        activeTokenResponse(),
        new Response(null, { status }),
      ];
      globalThis.fetch = (() =>
        Promise.resolve(responses.shift()!)) as typeof fetch;

      await expect(
        new KeycloakAuthProvider(
          createConfig({
            audiencePolicy: "always-exchange",
            tokenExchangeEnabled: true,
          }),
        ).authenticateBearerToken("subject-token"),
      ).rejects.toBeInstanceOf(errorType);
    }
  });

  test("allows a configured self-signed Keycloak certificate", async () => {
    const calls: BunFetchInit[] = [];
    globalThis.fetch = ((_, init) => {
      calls.push(init as BunFetchInit);
      return Promise.resolve(activeTokenResponse());
    }) as typeof fetch;

    await new KeycloakAuthProvider(
      createConfig({ allowSelfSignedCert: true }),
    ).authenticateBearerToken("keycloak-token");

    expect(calls[0].tls).toEqual({ rejectUnauthorized: false });
  });

  test("requires exchange configuration for exchange policies", () => {
    expect(
      () =>
        new KeycloakAuthProvider(
          createConfig({ audiencePolicy: "always-exchange" }),
        ),
    ).toThrow("tokenExchangeEnabled");
  });
});

type TokenOverrides = {
  aud?: string;
  azp?: string;
  exp?: number;
  preferred_username?: string;
  resource_access?: Record<string, { roles?: string[] }>;
  sub?: string;
};

function activeTokenResponse(overrides: TokenOverrides = {}) {
  return Response.json({
    active: true,
    aud: "portal-client",
    azp: "portal-client",
    sub: "user-id",
    preferred_username: "keycloak-user",
    exp: Math.floor(Date.now() / 1000) + 60,
    realm_access: { roles: ["realm-role"] },
    resource_access: {
      "portal-client": { roles: ["target-role"] },
      "basket-client": { roles: ["cross-client-role"] },
    },
    groups: ["/test-group"],
    ...overrides,
  });
}

type ConfigOverrides = {
  allowSelfSignedCert?: boolean;
  audiencePolicy?: string;
  expectedAuthorizedParty?: string;
  tokenExchangeEnabled?: boolean;
};

function createConfig(overrides: ConfigOverrides = {}): Config {
  const values = new Map<string, string | boolean>([
    ["vuu.keycloak.url", "https://localhost:8080"],
    ["vuu.keycloak.realm", "vuu"],
    ["vuu.auth.keycloak.clientId", "portal-client"],
    ["vuu.auth.keycloak.clientSecret", "test-secret"],
    ["vuu.auth.keycloak.audience", "portal-client"],
    ["vuu.auth.keycloak.authorizationClientId", "portal-client"],
    [
      "vuu.auth.keycloak.expectedAuthorizedParty",
      overrides.expectedAuthorizedParty ?? "",
    ],
    [
      "vuu.auth.keycloak.audiencePolicy",
      overrides.audiencePolicy ?? "require-audience",
    ],
    [
      "vuu.auth.keycloak.tokenExchangeEnabled",
      overrides.tokenExchangeEnabled ?? false,
    ],
    [
      "vuu.keycloak.allowSelfSignedCert",
      overrides.allowSelfSignedCert ?? false,
    ],
  ]);

  return {
    has: (key) => values.has(key),
    get: (key) => values.get(key),
    getString: (key, defaultValue) => {
      const value = values.get(key);
      if (value === undefined) {
        if (defaultValue === undefined) {
          throw new Error(`Missing config value for ${key}`);
        }
        return defaultValue;
      }
      return String(value);
    },
    getBoolean: (key, defaultValue) => {
      const value = values.get(key);
      if (value === undefined) {
        if (defaultValue === undefined) {
          throw new Error(`Missing config value for ${key}`);
        }
        return defaultValue;
      }
      return value === true;
    },
    getNumber: () => {
      throw new Error("Not used by this test");
    },
    getPath: () => {
      throw new Error("Not used by this test");
    },
    toObject: () => Object.fromEntries(values),
  };
}
