import { describe, expect, test } from "bun:test";
import {
  clientConfigurationsEqual,
  RETIRED_SERVER_CLIENT_NAMES,
  reconcilePortalClientConfiguration,
  reconcileServerClientConfiguration,
  reconcileSelfAudienceMapper,
  reconcileServerAudienceMappers,
  SERVER_CLIENT_NAMES,
  KEYCLOAK_CLIENT_SECRET_ENV,
  resolveKeycloakClientSecret,
} from "../keycloak-client-config";

describe("reconcileServerAudienceMappers", () => {
  test("manages every confidential VUU server client", () => {
    expect(SERVER_CLIENT_NAMES).toEqual([
      "vuu-portal-server",
      "vuu-module-admin-server",
      "vuu-user-admin-server",
      "vuu-basket-trading-server",
    ]);
  });

  test("migrates stale module-discovery audiences to user-admin", () => {
    const mappers = reconcileServerAudienceMappers([
      {
        name: "legacy-discovery",
        protocolMapper: "oidc-audience-mapper",
        config: {
          "included.client.audience": "vuu-module-discovery-server",
          "access.token.claim": "true",
        },
      },
      {
        name: "unrelated",
        protocolMapper: "oidc-usermodel-property-mapper",
        config: { "claim.name": "preferred_username" },
      },
    ]);

    expect(
      mappers.map(
        (mapper) => mapper.config?.["included.client.audience"],
      ),
    ).toEqual([undefined, ...SERVER_CLIENT_NAMES]);
    expect(mappers.map(({ name }) => name)).not.toContain("legacy-discovery");
    expect(RETIRED_SERVER_CLIENT_NAMES).toContain(
      "vuu-module-discovery-server",
    );
  });

  test("replaces existing server audience mappers idempotently", () => {
    const once = reconcileServerAudienceMappers([
      {
        id: "user-admin-mapper",
        name: "custom-user-admin-name",
        protocolMapper: "oidc-audience-mapper",
        config: {
          "included.client.audience": "vuu-user-admin-server",
          "included.custom.audience": "reporting-api",
        },
      },
    ]);
    const twice = reconcileServerAudienceMappers(once);

    expect(twice).toEqual(once);
    expect(twice).toHaveLength(SERVER_CLIENT_NAMES.length);
    expect(
      twice.find(
        (mapper) =>
          mapper.config?.["included.client.audience"] ===
          "vuu-user-admin-server",
      ),
    ).toMatchObject({
      id: "user-admin-mapper",
      config: { "included.custom.audience": "reporting-api" },
    });
  });
});

describe("reconcilePortalClientConfiguration", () => {
  test("disables full scope while retaining audiences and custom mappers", () => {
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

    expect(once.fullScopeAllowed).toBeFalse();
    expect(once.protocolMappers?.[0]).toMatchObject({
      id: "custom",
      name: "administrator-custom",
    });
    expect(
      once.protocolMappers
        ?.slice(1)
        .map((mapper) => mapper.config?.["included.client.audience"]),
    ).toEqual(SERVER_CLIENT_NAMES);
    expect(reconcilePortalClientConfiguration(once)).toEqual(once);
  });

  test("treats normalized mapper ordering as a no-op", () => {
    const current = reconcilePortalClientConfiguration({});
    const reordered = {
      ...current,
      protocolMappers: current.protocolMappers?.toReversed(),
    };

    expect(clientConfigurationsEqual(current, reordered)).toBeTrue();
  });
});

describe("reconcileSelfAudienceMapper", () => {
  test("adds an explicit self audience and preserves unrelated mappers", () => {
    const mappers = reconcileSelfAudienceMapper(
      [
        {
          id: "administrator-mapper",
          name: "administrator-mapper",
          protocolMapper: "oidc-usermodel-property-mapper",
          config: { "claim.name": "department" },
        },
        {
          id: "other-audience",
          name: "other-audience",
          protocolMapper: "oidc-audience-mapper",
          config: { "included.client.audience": "reporting-api" },
        },
      ],
      "vuu-module-admin-server",
    );

    expect(mappers).toHaveLength(3);
    expect(mappers.slice(0, 2)).toEqual([
      {
        id: "administrator-mapper",
        name: "administrator-mapper",
        protocolMapper: "oidc-usermodel-property-mapper",
        config: { "claim.name": "department" },
      },
      {
        id: "other-audience",
        name: "other-audience",
        protocolMapper: "oidc-audience-mapper",
        config: { "included.client.audience": "reporting-api" },
      },
    ]);
    expect(mappers[2]).toMatchObject({
      name: "audience-vuu-module-admin-server",
      protocolMapper: "oidc-audience-mapper",
      config: {
        "included.client.audience": "vuu-module-admin-server",
        "access.token.claim": "true",
      },
    });
  });

  test("reconciles the managed mapper idempotently", () => {
    const once = reconcileSelfAudienceMapper(
      [
        {
          id: "self-audience",
          name: "old-name",
          protocolMapper: "oidc-audience-mapper",
          config: {
            "included.client.audience": "vuu-user-admin-server",
            "included.custom.audience": "legacy-extra",
          },
        },
      ],
      "vuu-user-admin-server",
    );

    expect(reconcileSelfAudienceMapper(once, "vuu-user-admin-server")).toEqual(
      once,
    );
    expect(once[0]).toMatchObject({
      id: "self-audience",
      name: "audience-vuu-user-admin-server",
      config: {
        "included.custom.audience": "legacy-extra",
        "included.client.audience": "vuu-user-admin-server",
      },
    });
  });
});

describe("reconcileServerClientConfiguration", () => {
  test("enables exchange, self audience, and disables full scope", () => {
    const once = reconcileServerClientConfiguration(
      {
        id: "module-admin",
        fullScopeAllowed: false,
        attributes: { "administrator.attribute": "preserved" },
        protocolMappers: [
          {
            id: "administrator-mapper",
            protocolMapper: "oidc-usermodel-property-mapper",
          },
        ],
      },
      "vuu-module-admin-server",
      "module-secret",
    );

    expect(once).toMatchObject({
      id: "module-admin",
      fullScopeAllowed: false,
      secret: "module-secret",
      attributes: {
        "administrator.attribute": "preserved",
        "standard.token.exchange.enabled": "true",
      },
    });

    expect(once.protocolMappers).toHaveLength(2);
    expect(
      reconcileServerClientConfiguration(
        once,
        "vuu-module-admin-server",
        "module-secret",
      ),
    ).toEqual(once);
  });
});

describe("confidential client secret overrides", () => {
  test("shares fixed environment names between bootstrap and applications", () => {
    expect(KEYCLOAK_CLIENT_SECRET_ENV).toEqual({
      "vuu-portal-server": "VUU_PORTAL_SERVER_CLIENT_SECRET",
      "vuu-module-admin-server": "VUU_MODULE_ADMIN_SERVER_CLIENT_SECRET",
      "vuu-user-admin-server": "VUU_USER_ADMIN_SERVER_CLIENT_SECRET",
      "vuu-basket-trading-server": "VUU_BASKET_TRADING_SERVER_CLIENT_SECRET",
    });
    expect(
      resolveKeycloakClientSecret(
        "vuu-module-admin-server",
        "configured-secret",
        { VUU_MODULE_ADMIN_SERVER_CLIENT_SECRET: "environment-secret" },
      ),
    ).toBe("environment-secret");
  });
});
