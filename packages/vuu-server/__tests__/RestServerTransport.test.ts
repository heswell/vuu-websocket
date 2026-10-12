import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
  createConfiguredAuthProviders,
  createVuuServerApplication,
  PLAIN_HTTP_REST_REQUIRES_PERMISSIVE_AUTH,
  type Config,
} from "../src";

const certPath = fileURLToPath(
  new URL("../../vuu-demo/certs/cert.pem", import.meta.url),
);
const keyPath = fileURLToPath(
  new URL("../../vuu-demo/certs/key.pem", import.meta.url),
);

describe("RestServer transport", () => {
  test("permissive auth with vuu.ssl=false serves REST over plain http", async () => {
    const config = createConfig({
      "vuu.auth.mode": "permissive",
      "vuu.auth.permissive.users": "alice:secret",
      "vuu.https.port": 0,
      "vuu.ssl": false,
      "vuu.websocket.port": 0,
    });
    const application = createApplication(config);
    try {
      await application.lifecycle.start();
      const { restUrl, webSocketPort } = application.server;
      expect(restUrl).toStartWith("http://");

      const preflight = await fetch(`${restUrl}/api/authn`, {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:5002" },
      });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(
        "http://localhost:5002",
      );

      const response = await fetch(`${restUrl}/api/authn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:5002",
        },
        body: JSON.stringify({ username: "alice", password: "secret" }),
      });
      expect(response.status).toBe(200);
      const { token } = (await response.json()) as { token: string };
      expect(token).toBeString();
      expect(response.headers.get("vuu-auth-token")).toBe(token);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "http://localhost:5002",
      );

      const login = await websocketLogin(
        `ws://localhost:${webSocketPort}/websocket`,
        token,
      );
      expect(login.body).toMatchObject({ type: "LOGIN_SUCCESS" });
    } finally {
      await application.lifecycle.destroy();
    }
  });

  test("non-permissive auth with vuu.ssl=false refuses to start", async () => {
    const application = createVuuServerApplication({
      authProviders: {},
      config: createConfig({
        "vuu.auth.mode": "keycloak",
        "vuu.https.port": 0,
        "vuu.ssl": false,
        "vuu.websocket.port": 0,
      }),
      defaultHttpsPort: 0,
      defaultWebSocketPort: 0,
      modules: [],
    });
    try {
      await expect(application.lifecycle.start()).rejects.toThrow(
        PLAIN_HTTP_REST_REQUIRES_PERMISSIVE_AUTH,
      );
      expect(application.server.restUrl).toBeUndefined();
    } finally {
      await application.lifecycle.destroy();
    }
  });

  test("vuu.ssl=true serves REST over https", async () => {
    const application = createApplication(
      createConfig({
        "vuu.auth.mode": "permissive",
        "vuu.auth.permissive.users": "alice:secret",
        "vuu.certPath": certPath,
        "vuu.https.port": 0,
        "vuu.keyPath": keyPath,
        "vuu.ssl": true,
        "vuu.websocket.port": 0,
      }),
    );
    try {
      await application.lifecycle.start();
      const { restUrl } = application.server;
      expect(restUrl).toStartWith("https://");

      const response = await fetch(`${restUrl}/api/authn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "alice", password: "secret" }),
        tls: { rejectUnauthorized: false },
      });
      expect(response.status).toBe(200);
      const { token } = (await response.json()) as { token: string };
      expect(response.headers.get("vuu-auth-token")).toBe(token);

      await expect(
        fetch(restUrl!.replace("https://", "http://") + "/api/authn", {
          method: "POST",
        }),
      ).rejects.toThrow();
    } finally {
      await application.lifecycle.destroy();
    }
  });
});

function createApplication(config: Config) {
  return createVuuServerApplication({
    authProviders: createConfiguredAuthProviders(config),
    config,
    defaultHttpsPort: 0,
    defaultWebSocketPort: 0,
    modules: [],
  });
}

function websocketLogin(
  url: string,
  token: string,
): Promise<{ body: unknown }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener("error", () => reject(new Error("WebSocket failed")));
    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          body: { type: "LOGIN", token },
          module: "CORE",
          requestId: "login-request",
          sessionId: "",
        }),
      );
    });
    socket.addEventListener("message", ({ data }) => {
      socket.close();
      resolve(JSON.parse(String(data)) as { body: unknown });
    });
  });
}

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
