import { describe, expect, test } from "bun:test";
import {
  createConfiguredWebSocketOptions,
  createVuuServerApplication,
  type Config,
  VuuUserWithAuthorizations,
} from "../src";

describe("VuuServerApplication", () => {
  test("uses the generic websocket path by default", () => {
    const options = createConfiguredWebSocketOptions(
      createConfig({
        "vuu.ssl": false,
        "vuu.websocket.port": 8093,
      }),
      8091,
    );

    expect(options.uri).toBe("/websocket");
    expect(options.wsPort).toBe(8093);
    expect(options.sslOptions).toBe("ssl-disabled");
  });

  test("builds a configured websocket path", () => {
    const options = createConfiguredWebSocketOptions(
      createConfig({
        "vuu.ssl": false,
        "vuu.websocket.path": "/websocket-portal",
      }),
      8091,
    );

    expect(options.uri).toBe("/websocket-portal");
  });

  test.each([
    ["websocket"],
    ["/"],
    ["/websocket/"],
    ["/websocket?profile=portal"],
    ["/websocket#portal"],
    ["wss://localhost:8091/websocket"],
  ])("rejects malformed websocket path %s", (configuredPath) => {
    expect(() =>
      createConfiguredWebSocketOptions(
        createConfig({
          "vuu.ssl": false,
          "vuu.websocket.path": configuredPath,
        }),
        8091,
      ),
    ).toThrow(
      `Invalid WebSocket path '${configuredPath}'. Expected an absolute URL path without a trailing slash, query, or fragment.`,
    );
  });

  test("installs authn and additional HTTPS handlers", async () => {
    const application = createVuuServerApplication({
      additionalHttpHandlers: ({ getServer }) => [
        (_request, url) => {
          if (url.pathname !== "/health") {
            return undefined;
          }
          return Response.json({
            tables: getServer().tableContainer.getDefinedTables(),
          });
        },
      ],
      authProviders: {
        bearerToken: {
          authenticateBearerToken: async () =>
            VuuUserWithAuthorizations("alice", ["basket-trading-view"]),
        },
      },
      config: createConfig({
        "vuu.auth.cors.allowedOrigin": "http://localhost:5002",
        "vuu.auth.path": "/api/authn",
        "vuu.https.port": 9443,
        "vuu.ssl": false,
      }),
      defaultHttpsPort: 8443,
      defaultWebSocketPort: 8091,
      modules: [],
    });
    const handler = application.httpServerOptions.requestHandler;

    expect(application.httpServerOptions.httpsPort).toBe(9443);
    expect(handler).toBeDefined();

    const authResponse = await handler?.(
      new Request("https://localhost:9443/api/authn", {
        method: "POST",
        headers: { Authorization: "Bearer keycloak-access-token" },
      }),
      new URL("https://localhost:9443/api/authn"),
    );
    expect(authResponse?.status).toBe(200);
    expect(await authResponse?.json()).toEqual({
      token: expect.any(String),
    });

    const healthResponse = await handler?.(
      new Request("https://localhost:9443/health"),
      new URL("https://localhost:9443/health"),
    );
    expect(await healthResponse?.json()).toEqual({ tables: [] });
  });

  test("assembles a fixed additional auth profile with the shared token service", async () => {
    const application = createVuuServerApplication({
      additionalAuthProfiles: {
        "module-admin": {
          bearerToken: {
            authenticateBearerToken: async () =>
              VuuUserWithAuthorizations("alice", ["module-admin-edit"]),
          },
        },
      },
      authProviders: {},
      config: createConfig({ "vuu.ssl": false }),
      defaultHttpsPort: 8443,
      defaultWebSocketPort: 8091,
      modules: [],
    });
    const url = new URL("https://localhost:8443/api/authn/module-admin");
    const request = new Request(url.href, {
      method: "POST",
      headers: { Authorization: "******" },
    });
    request.headers.set(
      "Authorization",
      ["Bearer", "fixed-profile-token"].join(" "),
    );
    const response = await application.httpServerOptions.requestHandler?.(
      request,
      url,
    );
    const { token } = (await response?.json()) as { token: string };

    expect(response?.status).toBe(200);
    expect(
      application.loginTokenService.login({ type: "LOGIN", token }),
    ).toMatchObject({
      name: "alice",
      authorizations: ["module-admin-edit"],
    });
  });
});

function createConfig(values: Record<string, string | number | boolean>): Config {
  return {
    get: (key) => values[key],
    getBoolean: (key, defaultValue) =>
      values[key] === undefined ? required(defaultValue, key) : Boolean(values[key]),
    getNumber: (key, defaultValue) =>
      values[key] === undefined ? required(defaultValue, key) : Number(values[key]),
    getPath: (key, defaultValue) =>
      String(values[key] ?? required(defaultValue, key)),
    getString: (key, defaultValue) =>
      values[key] === undefined
        ? required(defaultValue, key)
        : String(values[key]),
    has: (key) => values[key] !== undefined,
    toObject: () => ({ ...values }),
  };
}

function required<T>(value: T | undefined, key: string): T {
  if (value === undefined) {
    throw new Error(`Missing required config key '${key}'`);
  }
  return value;
}
