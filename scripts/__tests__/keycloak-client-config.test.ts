import { describe, expect, test } from "bun:test";
import {
  clientConfigurationsEqual,
  KEYCLOAK_CLIENT_SECRET_ENV,
  reconcilePortalClientConfiguration,
  reconcileSelfAudienceMapper,
  reconcileServerAudienceMappers,
  reconcileServerClientConfiguration,
  resolveKeycloakClientSecret,
  SERVER_CLIENT_NAMES,
} from "../keycloak-client-config";

describe("Keycloak client configuration", () => {
  test("manages the confidential server and remote application clients", () => {
    expect(SERVER_CLIENT_NAMES).toEqual([
      "vuu-portal-server",
      "vuu-user-admin",
      "vuu-basket-trading",
    ]);
  });

  test("configures the public portal and preserves custom mappers", () => {
    const once = reconcilePortalClientConfiguration({
      fullScopeAllowed: true,
      protocolMappers: [
        {
          id: "custom",
          name: "administrator-custom",
          protocolMapper: "oidc-usermodel-property-mapper",
        },
      ],
    });

    expect(once).toMatchObject({
      publicClient: true,
      bearerOnly: false,
      standardFlowEnabled: true,
      implicitFlowEnabled: false,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: false,
      fullScopeAllowed: false,
    });
    expect(once.protocolMappers?.[0]).toMatchObject({
      id: "custom",
      name: "administrator-custom",
    });
    expect(
      once.protocolMappers
        ?.slice(1)
        .map((mapper) => mapper.config?.["included.client.audience"]),
    ).toEqual(SERVER_CLIENT_NAMES);
    expect(
      clientConfigurationsEqual(
        once,
        { ...once, protocolMappers: once.protocolMappers?.toReversed() },
      ),
    ).toBeTrue();
  });

  test("reconciles server self-audience mappers idempotently", () => {
    const once = reconcileSelfAudienceMapper(
      [
        {
          id: "self-audience",
          name: "old-name",
          protocolMapper: "oidc-audience-mapper",
          config: {
            "included.client.audience": "vuu-user-admin",
            "included.custom.audience": "legacy-extra",
          },
        },
      ],
      "vuu-user-admin",
    );

    expect(reconcileSelfAudienceMapper(once, "vuu-user-admin")).toEqual(once);
    expect(once[0]).toMatchObject({
      id: "self-audience",
      name: "audience-vuu-user-admin",
      config: {
        "included.custom.audience": "legacy-extra",
        "included.client.audience": "vuu-user-admin",
      },
    });
  });

  test("configures confidential clients without replacing custom settings", () => {
    const once = reconcileServerClientConfiguration(
      {
        id: "portal-server",
        fullScopeAllowed: true,
        attributes: { "administrator.attribute": "preserved" },
        protocolMappers: [],
      },
      "vuu-portal-server",
      "configured-secret",
    );

    expect(once).toMatchObject({
      id: "portal-server",
      publicClient: false,
      bearerOnly: false,
      standardFlowEnabled: false,
      implicitFlowEnabled: false,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: true,
      fullScopeAllowed: false,
      secret: "configured-secret",
      attributes: {
        "administrator.attribute": "preserved",
        "standard.token.exchange.enabled": "true",
      },
    });
    expect(
      reconcileServerClientConfiguration(
        once,
        "vuu-portal-server",
        "configured-secret",
      ),
    ).toEqual(once);
  });

  test("uses environment overrides without requiring committed secrets", () => {
    expect(KEYCLOAK_CLIENT_SECRET_ENV).toEqual({
      "vuu-portal-server": "VUU_PORTAL_SERVER_CLIENT_SECRET",
      "vuu-user-admin": "VUU_USER_ADMIN_SERVER_CLIENT_SECRET",
      "vuu-basket-trading": "VUU_BASKET_TRADING_SERVER_CLIENT_SECRET",
    });
    expect(
      resolveKeycloakClientSecret(
        "vuu-user-admin",
        undefined,
        { VUU_USER_ADMIN_SERVER_CLIENT_SECRET: "environment-secret" },
      ),
    ).toBe("environment-secret");
  });
});
