import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  type Config,
  ConfigFactory,
  type ConfigEnvironment,
  createAuthHttpHandler,
  createConfiguredAuthProviders,
  createVuuServerApplication,
  getConfiguredAllowedOrigins,
  LoginTokenService,
  parseAllowedOrigins,
  VuuUserWithAuthorizations,
} from "../src";

const LOCALHOST = "http://localhost:5100";
const LOOPBACK = "http://127.0.0.1:5100";
const OTHER = "http://localhost:5200";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vuu-cors-"));
afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));

function loadConf(contents: string, env: ConfigEnvironment = {}): Config {
  const file = path.join(
    tempDir,
    `application-${Math.random().toString(36).slice(2)}.conf`,
  );
  fs.writeFileSync(file, contents);
  return ConfigFactory.fromFile(file, { env });
}

function createApplication(config: Config) {
  return createVuuServerApplication({
    authProviders: createConfiguredAuthProviders(config),
    config,
    defaultHttpsPort: 8443,
    defaultWebSocketPort: 8091,
    modules: [],
  });
}

async function send(
  config: Config,
  init: RequestInit & { headers?: Record<string, string> },
) {
  const handler = createApplication(config).httpServerOptions.requestHandler!;
  const request = new Request("https://localhost:8443/api/authn", init);
  return (await handler(request, new URL(request.url)))!;
}

const preflight = (origin: string) => ({
  method: "OPTIONS",
  headers: {
    Origin: origin,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "content-type",
  },
});

const login = (body: unknown, origin?: string) => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(origin ? { Origin: origin } : {}),
  },
  body: JSON.stringify(body),
});

const STOCK_CORS_LINES = `
vuu.auth.mode="permissive"
vuu.auth.cors.allowedOrigins=["${LOCALHOST}", "${LOOPBACK}"]
vuu.auth.cors.allowedOrigins=\${?VUU_CORS_ALLOWED_ORIGIN}
vuu.auth.cors.allowedOrigins=\${?VUU_CORS_ALLOWED_ORIGINS}
`;

describe("CORS allowed origins", () => {
  test("allows each listed origin, echoing only the request origin", async () => {
    const config = loadConf(STOCK_CORS_LINES);
    for (const origin of [LOCALHOST, LOOPBACK]) {
      const response = await send(config, login({ username: "a" }, origin));
      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
      expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
        "true",
      );
      expect(response.headers.get("Vary")).toBe("Origin");
    }
  });

  test("denies an origin that is not listed", async () => {
    const config = loadConf(STOCK_CORS_LINES);
    const response = await send(config, login({ username: "a" }, OTHER));
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(response.headers.has("Access-Control-Allow-Credentials")).toBe(
      false,
    );
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  test("answers preflight for allowed origins and refuses others", async () => {
    const config = loadConf(STOCK_CORS_LINES);

    const allowed = await send(config, preflight(LOOPBACK));
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(LOOPBACK);
    expect(allowed.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true",
    );
    expect(allowed.headers.get("Access-Control-Allow-Methods")).toBe(
      "POST, OPTIONS",
    );
    expect(allowed.headers.get("Access-Control-Allow-Headers")).toBe(
      "Authorization, Content-Type",
    );
    expect(allowed.headers.get("Vary")).toBe("Origin");

    const denied = await send(config, preflight(OTHER));
    expect(denied.status).toBe(403);
    expect(denied.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(denied.headers.has("Access-Control-Allow-Methods")).toBe(false);
  });

  test("still honours the legacy single-origin key", async () => {
    const config = loadConf(`
vuu.auth.mode="permissive"
vuu.auth.cors.allowedOrigin="${LOCALHOST}"
`);
    expect(getConfiguredAllowedOrigins(config, "permissive")).toEqual([
      LOCALHOST,
    ]);
    const allowed = await send(config, preflight(LOCALHOST));
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(LOCALHOST);
    expect((await send(config, preflight(LOOPBACK))).status).toBe(403);
  });

  test("merges the legacy key with the list", () => {
    const config = loadConf(`
vuu.auth.cors.allowedOrigins="${LOCALHOST}"
vuu.auth.cors.allowedOrigin="${LOOPBACK}, ${LOCALHOST}"
`);
    expect(getConfiguredAllowedOrigins(config, "keycloak")).toEqual([
      LOCALHOST,
      LOOPBACK,
    ]);
  });

  test("defaults to http://localhost:5002", () => {
    expect(getConfiguredAllowedOrigins(loadConf(""), "keycloak")).toEqual([
      "http://localhost:5002",
    ]);
  });

  test.each(["VUU_CORS_ALLOWED_ORIGINS", "VUU_CORS_ALLOWED_ORIGIN"])(
    "%s replaces the conf list with a comma-separated list",
    async (envVar) => {
      const config = loadConf(STOCK_CORS_LINES, {
        [envVar]: `${OTHER}, https://trader.example.com/`,
      });
      expect(getConfiguredAllowedOrigins(config, "permissive")).toEqual([
        OTHER,
        "https://trader.example.com",
      ]);
      const response = await send(config, preflight(OTHER));
      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(OTHER);
      expect((await send(config, preflight(LOCALHOST))).status).toBe(403);
    },
  );

  test('allows "*" only with permissive auth, and never with credentials', async () => {
    const wildcard = `vuu.auth.cors.allowedOrigins="*"\n`;
    expect(() =>
      createApplication(loadConf(`vuu.auth.mode="keycloak"\n${wildcard}`)),
    ).toThrow('CORS allowed origin "*" is only allowed with vuu.auth.mode="permissive"');

    const config = loadConf(`vuu.auth.mode="permissive"\n${wildcard}`);
    const response = await send(config, login({ username: "a" }, OTHER));
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.has("Access-Control-Allow-Credentials")).toBe(
      false,
    );
    expect((await send(config, preflight(OTHER))).status).toBe(204);
  });

  test("rejects entries that are not origins", () => {
    expect(() => parseAllowedOrigins("http://localhost:5100/app")).toThrow(
      "Invalid CORS allowed origin",
    );
    expect(() => parseAllowedOrigins("localhost:5100")).toThrow(
      "Invalid CORS allowed origin",
    );
    expect(parseAllowedOrigins(`["${LOCALHOST}/", '${LOOPBACK}', ""]`)).toEqual(
      [LOCALHOST, LOOPBACK],
    );
  });

  test("the handler option accepts a list and the legacy single origin", async () => {
    const handler = createAuthHttpHandler(
      {
        bearerToken: {
          authenticateBearerToken: async () =>
            VuuUserWithAuthorizations("a", []),
        },
      },
      LoginTokenService(),
      { allowedOrigin: LOCALHOST, allowedOrigins: [LOOPBACK] },
    );
    for (const origin of [LOCALHOST, LOOPBACK]) {
      const request = new Request(
        "https://localhost:8443/api/authn",
        preflight(origin),
      );
      const response = await handler(request, new URL(request.url));
      expect(response?.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    }
  });
});

describe("permissive auth credentials", () => {
  const permissive = (users = "") =>
    loadConf(`
vuu.auth.mode="permissive"
vuu.auth.permissive.users="${users}"
`);

  async function authenticate(config: Config, body: unknown) {
    const response = await send(config, login(body));
    const json = (await response.json()) as { token?: string };
    return { response, json };
  }

  test("accepts any username with an empty password", async () => {
    const { response, json } = await authenticate(permissive(), {
      username: "anyone",
      password: "",
    });
    expect(response.status).toBe(200);
    expect(json.token).toBeString();
    expect(response.headers.get("vuu-auth-token")).toBe(json.token!);
  });

  test("accepts any username with a missing password", async () => {
    const { response, json } = await authenticate(permissive(), {
      username: "anyone",
    });
    expect(response.status).toBe(200);
    const [payload] = json.token!.split(".");
    expect(
      JSON.parse(Buffer.from(payload, "base64url").toString()),
    ).toMatchObject({ name: "anyone" });
  });

  test("still requires a username", async () => {
    const { response } = await authenticate(permissive(), { password: "" });
    expect(response.status).toBe(401);
  });

  test("rejects a configured user with the wrong or no password", async () => {
    const config = permissive("alice:secret,bob");
    for (const password of ["wrong", "", undefined]) {
      const { response } = await authenticate(config, {
        username: "alice",
        password,
      });
      expect(response.status).toBe(401);
    }
    expect(
      (await authenticate(config, { username: "alice", password: "secret" }))
        .response.status,
    ).toBe(200);
    expect(
      (await authenticate(config, { username: "bob" })).response.status,
    ).toBe(200);
    expect(
      (await authenticate(config, { username: "carol" })).response.status,
    ).toBe(401);
  });

  test("other credential providers still require a password", async () => {
    let called = false;
    const handler = createAuthHttpHandler(
      {
        credentials: {
          authenticate: async (username) => {
            called = true;
            return VuuUserWithAuthorizations(username, []);
          },
        },
      },
      LoginTokenService(),
    );
    for (const body of [
      { username: "a", password: "" },
      { username: "a" },
    ]) {
      const request = new Request(
        "https://localhost:8443/api/authn",
        login(body),
      );
      expect((await handler(request, new URL(request.url)))?.status).toBe(401);
    }
    expect(called).toBe(false);
  });
});
