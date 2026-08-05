import { describe, expect, test } from "bun:test";
import {
  createConfiguredWebSocketOptions,
  createVuuServerApplication,
  type Config,
  VuuUserWithAuthorizations,
} from "../src";

describe("VuuServerApplication", () => {
  test("builds websocket options from application config", () => {
    const options = createConfiguredWebSocketOptions(
      createConfig({
        "vuu.ssl": false,
        "vuu.websocket.port": 8093,
      }),
      8091,
    );

    expect(options.uri).toBe("websocket");
    expect(options.wsPort).toBe(8093);
    expect(options.sslOptions).toBe("ssl-disabled");
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
            VuuUserWithAuthorizations("alice", ["basket.view"]),
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
