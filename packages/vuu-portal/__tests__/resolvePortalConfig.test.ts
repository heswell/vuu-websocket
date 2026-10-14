import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { ConfigFactory } from "@heswell/vuu-server";
import {
  BUNDLED_CONFIG_FILE,
  createPortalApplication,
  resolvePortalConfig,
} from "../src/index";

// Issue #87: `bunx vuu-portal` with no --config uses the bundled conf.

const root = path.join(import.meta.dir, ".test-output", "resolve-config");
const packageRoot = path.resolve(import.meta.dir, "..");

const writeConf = (file: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'vuu.auth.mode="permissive"\nvuu.ssl=false\n');
  return file;
};

beforeEach(() => fs.mkdirSync(root, { recursive: true }));
afterEach(() => {
  ConfigFactory.reset();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("resolvePortalConfig", () => {
  test("bundles config/application.conf with the package", () => {
    expect(BUNDLED_CONFIG_FILE).toBe(
      path.join(packageRoot, "config", "application.conf"),
    );
  });

  test("fallback order: --config, VUU_CONFIG_FILE, VUU_APP, ./application.conf, bundled", () => {
    const explicit = writeConf(path.join(root, "explicit.conf"));
    const fromEnv = writeConf(path.join(root, "env.conf"));
    const fromApp = writeConf(
      path.join(root, "packages", "my-app", "application.conf"),
    );
    const env = { VUU_CONFIG_FILE: "env.conf", VUU_APP: "my-app" };
    const resolve = (configFile?: string, e: Record<string, string> = env) =>
      resolvePortalConfig({ configFile, cwd: root, env: e });

    expect(resolve("explicit.conf")).toEqual({
      configFile: explicit,
      source: "--config",
    });
    expect(resolve()).toEqual({
      configFile: fromEnv,
      source: "VUU_CONFIG_FILE",
    });
    expect(resolve(undefined, { VUU_APP: "my-app" })).toEqual({
      configFile: fromApp,
      source: "VUU_APP",
    });
    expect(resolve(undefined, {}).source).toBe("bundled");
    const cwdConf = writeConf(path.join(root, "application.conf"));
    expect(resolve(undefined, {})).toEqual({
      configFile: cwdConf,
      source: "cwd",
    });
  });

  test("a missing explicit conf is an error, not a fallback", () => {
    expect(() =>
      resolvePortalConfig({ configFile: "nope.conf", cwd: root, env: {} }),
    ).toThrow("Config file not found");
    expect(() =>
      resolvePortalConfig({ cwd: root, env: { VUU_CONFIG_FILE: "nope.conf" } }),
    ).toThrow("VUU_CONFIG_FILE");
    expect(() =>
      resolvePortalConfig({ cwd: root, env: { VUU_APP: "nope" } }),
    ).toThrow("VUU_APP");
  });

  test("bundled: writable and env-provided paths resolve against the cwd", () => {
    expect(resolvePortalConfig({ cwd: root, env: {} }).overrides).toEqual({
      "vuu.portal.modulesFile": path.join(root, "modules.yaml"),
    });
    expect(
      resolvePortalConfig({
        cwd: root,
        env: {
          VUU_PORTAL_MODULES_FILE: "state/m.yaml",
          VUU_CERT_PATH: "certs/cert.pem",
          VUU_KEY_PATH: "/abs/key.pem",
          VUU_PORTAL_DEFAULT_MODULES_FILE: "defaults.yaml",
        },
      }).overrides,
    ).toEqual({
      "vuu.portal.modulesFile": path.join(root, "state", "m.yaml"),
      "vuu.certPath": path.join(root, "certs", "cert.pem"),
      "vuu.keyPath": "/abs/key.pem",
      "vuu.portal.defaultModulesFile": path.join(root, "defaults.yaml"),
    });
  });
});

describe("bundled application.conf", () => {
  const { configFile, overrides } = resolvePortalConfig({ cwd: root, env: {} });
  const load = (env: Record<string, string> = {}) =>
    ConfigFactory.fromFile(configFile, { overrides, env });

  test("is permissive, without TLS, secrets or certificates", () => {
    const config = load();
    expect(config.getString("vuu.auth.mode")).toBe("permissive");
    expect(config.getBoolean("vuu.ssl")).toBe(false);
    expect(config.has("vuu.certPath")).toBe(false);
    expect(config.has("vuu.keyPath")).toBe(false);
    expect(config.has("vuu.auth.keycloak.clientSecret")).toBe(false);
    expect(config.getNumber("vuu.websocket.port")).toBe(8091);
    expect(config.getNumber("vuu.https.port")).toBe(8443);
  });

  test("default modules come from the package, modules.yaml from the cwd", () => {
    const config = load();
    expect(config.getPath("vuu.portal.defaultModulesFile")).toBe(
      path.join(packageRoot, "config", "default-modules.yaml"),
    );
    expect(config.getPath("vuu.portal.modulesFile")).toBe(
      path.join(root, "modules.yaml"),
    );
  });

  test("every setting can be overridden from the environment", () => {
    const config = load({
      VUU_AUTH_MODE: "keycloak",
      VUU_SSL: "true",
      VUU_WEBSOCKET_PORT: "9191",
      VUU_HTTPS_PORT: "9543",
      VUU_KEYCLOAK_CLIENT_SECRET: "s3cret",
      VUU_LOG_LEVEL: "debug",
    });
    expect(config.getString("vuu.auth.mode")).toBe("keycloak");
    expect(config.getBoolean("vuu.ssl")).toBe(true);
    expect(config.getNumber("vuu.websocket.port")).toBe(9191);
    expect(config.getNumber("vuu.https.port")).toBe(9543);
    expect(config.getString("vuu.auth.keycloak.clientSecret")).toBe("s3cret");
    expect(config.getString("vuu.log.level")).toBe("debug");
  });
});

describe("createPortalApplication with the bundled conf", () => {
  let cwd: string;
  const savedEnv = { ...process.env };
  beforeEach(() => {
    cwd = process.cwd();
    process.chdir(root);
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("VUU_")) delete process.env[key];
    }
  });
  afterEach(() => {
    process.chdir(cwd);
    process.env = { ...savedEnv };
  });

  test("starts from zero config, writing modules.yaml to the cwd", () => {
    const application = createPortalApplication();
    expect(application.webSocketOptions.wsPort).toBe(8091);
    expect(fs.existsSync(path.join(root, "modules.yaml"))).toBe(true);
    expect(
      fs.existsSync(path.join(packageRoot, "config", "modules.yaml")),
    ).toBe(false);
  });

  test("VUU_SSL=true without certificates is a clear error", () => {
    process.env.VUU_SSL = "true";
    expect(() => createPortalApplication()).toThrow("VUU_CERT_PATH");
  });
});
