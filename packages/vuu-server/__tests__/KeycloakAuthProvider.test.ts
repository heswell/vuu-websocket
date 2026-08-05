import { afterEach, describe, expect, test } from "bun:test";
import { Config } from "../src/util/ConfigFactory";
import { KeycloakAuthProvider } from "../src/net/auth/KeycloakAuthProvider";

type BunFetchInit = RequestInit & {
  tls?: {
    rejectUnauthorized?: boolean;
  };
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("KeycloakAuthProvider", () => {
  test("introspects a correctly scoped token", async () => {
    const requests: Array<{ url: string; init: BunFetchInit }> = [];
    globalThis.fetch = ((url, init) => {
      requests.push({ url: String(url), init: init as BunFetchInit });
      return Promise.resolve(activeTokenResponse("portal-client"));
    }) as typeof fetch;

    const user = await new KeycloakAuthProvider(
      createConfig(),
    ).authenticateBearerToken("keycloak-token");

    expect(user.name).toBe("keycloak-user");
    expect(user.authorizations).toEqual([
      "realm-role",
      "client-role",
      "cross-client-role",
      "/test-group",
    ]);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toEndWith("/token/introspect");
    expect(requests[0].init.tls).toBeUndefined();
  });

  test("rejects a token for the wrong audience", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(activeTokenResponse("another-client"))) as typeof fetch;

    await expect(
      new KeycloakAuthProvider(createConfig()).authenticateBearerToken(
        "keycloak-token",
      ),
    ).rejects.toThrow("not scoped to audience");
  });

  test("exchanges and validates a token when the audience is missing", async () => {
    const requests: Array<{ url: string; body: URLSearchParams }> = [];
    const responses = [
      activeTokenResponse("host-client"),
      new Response(JSON.stringify({ access_token: "remote-token" })),
      activeTokenResponse("portal-client"),
    ];
    globalThis.fetch = ((url, init) => {
      requests.push({
        url: String(url),
        body: init?.body as URLSearchParams,
      });
      return Promise.resolve(responses.shift()!);
    }) as typeof fetch;

    const user = await new KeycloakAuthProvider(
      createConfig({
        audiencePolicy: "exchange-if-needed",
        tokenExchangeEnabled: true,
      }),
    ).authenticateBearerToken("subject-token");

    expect(user.name).toBe("keycloak-user");
    expect(requests).toHaveLength(3);
    expect(requests[1].url).toEndWith("/token");
    expect(requests[1].body.get("subject_token")).toBe("subject-token");
    expect(requests[1].body.get("audience")).toBe("portal-client");
    expect(requests[2].body.get("token")).toBe("remote-token");
  });

  test("fails closed when token exchange fails", async () => {
    const responses = [
      activeTokenResponse("host-client"),
      new Response(null, { status: 403, statusText: "Forbidden" }),
    ];
    globalThis.fetch = (() =>
      Promise.resolve(responses.shift()!)) as typeof fetch;

    await expect(
      new KeycloakAuthProvider(
        createConfig({
          audiencePolicy: "exchange-if-needed",
          tokenExchangeEnabled: true,
        }),
      ).authenticateBearerToken("subject-token"),
    ).rejects.toThrow("token exchange failed");
  });

  test("reports Keycloak server failures as unavailable", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response(null, { status: 503 }))) as typeof fetch;

    await expect(
      new KeycloakAuthProvider(createConfig()).authenticateBearerToken("token"),
    ).rejects.toMatchObject({
      name: "Error",
      message: "Keycloak token validation is unavailable",
    });
  });

  test("rejects inactive and expired tokens", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify({ active: false })))) as typeof fetch;
    await expect(
      new KeycloakAuthProvider(createConfig()).authenticateBearerToken("token"),
    ).rejects.toThrow("inactive");

    globalThis.fetch = (() =>
      Promise.resolve(
        activeTokenResponse(
          "portal-client",
          Math.floor(Date.now() / 1000) - 1,
        ),
      )) as typeof fetch;
    await expect(
      new KeycloakAuthProvider(createConfig()).authenticateBearerToken("token"),
    ).rejects.toThrow("expired");
  });

  test("allows a configured self-signed Keycloak certificate", async () => {
    const fetchCalls: BunFetchInit[] = [];
    globalThis.fetch = ((_, init) => {
      fetchCalls.push(init as BunFetchInit);
      return Promise.resolve(activeTokenResponse("portal-client"));
    }) as typeof fetch;

    await new KeycloakAuthProvider(
      createConfig({ allowSelfSignedCert: true }),
    ).authenticateBearerToken("keycloak-token");

    expect(fetchCalls[0].tls).toEqual({ rejectUnauthorized: false });
  });

  test("requires exchange configuration for exchange policies", () => {
    expect(
      () =>
        new KeycloakAuthProvider(
          createConfig({ audiencePolicy: "exchange-if-needed" }),
        ),
    ).toThrow("tokenExchangeEnabled");
  });
});

function activeTokenResponse(audience: string, exp = futureExpiry()) {
  return new Response(
    JSON.stringify({
      active: true,
      aud: audience,
      preferred_username: "keycloak-user",
      exp,
      realm_access: { roles: ["realm-role"] },
      resource_access: {
        "portal-client": { roles: ["client-role"] },
        "basket-client": { roles: ["cross-client-role"] },
      },
      groups: ["/test-group"],
    }),
  );
}

function futureExpiry() {
  return Math.floor(Date.now() / 1000) + 60;
}

type ConfigOverrides = {
  allowSelfSignedCert?: boolean;
  audiencePolicy?: string;
  tokenExchangeEnabled?: boolean;
};

function createConfig(overrides: ConfigOverrides = {}): Config {
  const values = new Map<string, string | boolean>([
    ["vuu.keycloak.url", "https://localhost:8080"],
    ["vuu.keycloak.realm", "vuu"],
    ["vuu.auth.keycloak.clientId", "portal-client"],
    ["vuu.auth.keycloak.clientSecret", "test-secret"],
    ["vuu.auth.keycloak.audience", "portal-client"],
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
