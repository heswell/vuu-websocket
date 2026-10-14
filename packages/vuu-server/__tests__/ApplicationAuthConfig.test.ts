import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { getConfiguredAllowedOrigins } from "../src/net/http/CorsOrigins";
import { ConfigFactory } from "../src/util/ConfigFactory";

afterEach(() => ConfigFactory.reset());

describe("application authentication configuration", () => {
  test.each([
    ["vuu-user-admin", "vuu-user-admin"],
    ["vuu-basket-trading", "vuu-basket-trading"],
  ])("%s always exchanges into its own authorization client", (app, clientId) => {
    const config = loadApplicationConfig(app);

    expect(config.getString("vuu.auth.keycloak.clientId")).toBe(clientId);
    expect(config.getString("vuu.auth.keycloak.audience")).toBe(clientId);
    expect(config.getString("vuu.auth.keycloak.authorizationClientId")).toBe(
      clientId,
    );
    expect(config.getString("vuu.auth.keycloak.expectedAuthorizedParty")).toBe(
      clientId,
    );
    expect(config.getString("vuu.auth.keycloak.audiencePolicy")).toBe(
      "always-exchange",
    );
    expect(config.getBoolean("vuu.auth.keycloak.tokenExchangeEnabled")).toBe(
      true,
    );
  });

  test("portal navigation authorizes only public portal roles", () => {
    const config = loadApplicationConfig("vuu-portal");

    expect(config.getString("vuu.auth.keycloak.clientId")).toBe(
      "vuu-portal-server",
    );
    expect(config.getString("vuu.auth.keycloak.authorizationClientId")).toBe(
      "vuu-portal",
    );
    expect(config.getString("vuu.auth.keycloak.expectedAuthorizedParty")).toBe(
      "vuu-portal",
    );
    expect(config.getString("vuu.auth.keycloak.audiencePolicy")).toBe(
      "require-audience",
    );
  });

  test.each([
    ["vuu-portal", "/websocket-portal", 8091],
    ["vuu-user-admin", "/websocket-user-admin", 8092],
    ["vuu-basket-trading", "/websocket-basket-trading", 8093],
  ])(
    "%s exposes its server-specific websocket path without changing authn",
    (app, websocketPath, websocketPort) => {
      const config = loadApplicationConfig(app);

      expect(config.getString("vuu.websocket.path")).toBe(websocketPath);
      expect(config.getNumber("vuu.websocket.port")).toBe(websocketPort);
      expect(config.getString("vuu.auth.path")).toBe("/api/authn");
    },
  );

  test.each(["vuu-portal", "vuu-user-admin", "vuu-basket-trading"])(
    "%s allows its host on both localhost and 127.0.0.1",
    (app) => {
      const config = ConfigFactory.fromFile(
        path.resolve(import.meta.dir, `../../${app}/application.conf`),
        { env: {} },
      );
      expect(getConfiguredAllowedOrigins(config, "keycloak")).toEqual([
        "http://localhost:5001",
        "http://127.0.0.1:5001",
      ]);
    },
  );
});

function loadApplicationConfig(app: string) {
  ConfigFactory.reset();
  return ConfigFactory.load(
    path.resolve(import.meta.dir, `../../${app}/application.conf`),
  );
}
