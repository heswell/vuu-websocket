import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { ConfigFactory } from "@heswell/vuu-server";
import { createPortalApplication } from "../src/index";
import { DEFAULT_MODULES_FILE } from "./defaultModules";

const root = path.join(import.meta.dir, ".test-output", "portal-application");

afterEach(() => {
  ConfigFactory.reset();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("createPortalApplication", () => {
  test("takes ports, websocket path, module files and admin role from the conf file", () => {
    const confDir = path.join(root, "conf");
    fs.mkdirSync(confDir, { recursive: true });
    fs.copyFileSync(DEFAULT_MODULES_FILE, path.join(confDir, "catalogue.yaml"));
    const configFile = path.join(confDir, "application.conf");
    fs.writeFileSync(
      configFile,
      [
        'vuu.auth.mode="permissive"',
        "vuu.ssl=false",
        "vuu.https.port=9543",
        "vuu.websocket.port=9191",
        'vuu.websocket.path="/ws-custom"',
        'vuu.portal.defaultModulesFile="catalogue.yaml"',
        'vuu.portal.modulesFile="state/modules.yaml"',
        'vuu.portal.moduleAdminRole="custom-admin"',
      ].join("\n"),
    );

    const application = createPortalApplication({ configFile });

    expect(application.config.getString("vuu.portal.moduleAdminRole")).toBe(
      "custom-admin",
    );
    expect(application.httpServerOptions.httpsPort).toBe(9543);
    expect(application.webSocketOptions.wsPort).toBe(9191);
    expect(application.webSocketOptions.uri).toBe("/ws-custom");
    expect(fs.existsSync(path.join(confDir, "state", "modules.yaml"))).toBe(
      true,
    );
  });

  test("falls back to the portal defaults when the conf sets no ports", () => {
    fs.mkdirSync(root, { recursive: true });
    fs.copyFileSync(DEFAULT_MODULES_FILE, path.join(root, "default-modules.yaml"));
    const configFile = path.join(root, "application.conf");
    fs.writeFileSync(configFile, 'vuu.auth.mode="permissive"\nvuu.ssl=false\n');

    const application = createPortalApplication({ configFile });

    expect(application.httpServerOptions.httpsPort).toBe(8443);
    expect(application.webSocketOptions.wsPort).toBe(8091);
    expect(application.webSocketOptions.uri).toBe("/websocket-portal");
    expect(fs.existsSync(path.join(root, "modules.yaml"))).toBe(true);
  });
});
