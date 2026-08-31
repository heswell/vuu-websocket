import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { ConfigFactory } from "../src/util/ConfigFactory";

afterEach(() => ConfigFactory.reset());

describe("application authentication configuration", () => {
  test.each([
    ["vuu-user-admin", "vuu-user-admin-server"],
    ["vuu-basket-trading", "vuu-basket-trading-server"],
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
});

function loadApplicationConfig(app: string) {
  ConfigFactory.reset();
  return ConfigFactory.load(
    path.resolve(import.meta.dir, `../../${app}/application.conf`),
  );
}
