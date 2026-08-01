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
  test("allows a configured self-signed Keycloak certificate", async () => {
    const fetchCalls: BunFetchInit[] = [];
    globalThis.fetch = ((_, init) => {
      fetchCalls.push(init as BunFetchInit);
      return Promise.resolve(activeTokenResponse());
    }) as typeof fetch;

    await new KeycloakAuthProvider(createConfig(true)).authenticateBearerToken(
      "keycloak-token",
    );

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].tls).toEqual({ rejectUnauthorized: false });
  });

  test("verifies Keycloak certificates by default", async () => {
    const fetchCalls: BunFetchInit[] = [];
    globalThis.fetch = ((_, init) => {
      fetchCalls.push(init as BunFetchInit);
      return Promise.resolve(activeTokenResponse());
    }) as typeof fetch;

    await new KeycloakAuthProvider(createConfig()).authenticateBearerToken(
      "keycloak-token",
    );

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].tls).toBeUndefined();
  });
});

function activeTokenResponse() {
  return new Response(
    JSON.stringify({
      active: true,
      preferred_username: "keycloak-user",
      exp: Math.floor(Date.now() / 1000) + 60,
    }),
  );
}

function createConfig(allowSelfSignedCert = false): Config {
  const values = new Map<string, string | boolean>([
    ["vuu.keycloak.url", "https://localhost:8080"],
    ["vuu.keycloak.realm", "vuu"],
    ["vuu.auth.keycloak.clientId", "vuu-portal-server"],
    ["vuu.auth.keycloak.clientSecret", "test-secret"],
    ["vuu.keycloak.allowSelfSignedCert", allowSelfSignedCert],
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
