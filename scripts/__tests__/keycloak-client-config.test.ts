import { describe, expect, test } from "bun:test";
import {
  RETIRED_SERVER_CLIENT_NAMES,
  reconcileServerAudienceMappers,
  SERVER_CLIENT_NAMES,
} from "../keycloak-client-config";

describe("reconcileServerAudienceMappers", () => {
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
