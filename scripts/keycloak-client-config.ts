export const SERVER_CLIENT_NAMES = [
  "vuu-portal-server",
  "vuu-module-admin-server",
  "vuu-user-admin-server",
  "vuu-basket-trading-server",
] as const;

export type ServerClientName = (typeof SERVER_CLIENT_NAMES)[number];

export {
  KEYCLOAK_CLIENT_SECRET_ENV,
  LOCAL_KEYCLOAK_CLIENT_SECRETS as SERVER_CLIENT_SECRETS,
  resolveKeycloakClientSecret,
} from "../packages/vuu-server/src/net/auth/KeycloakClientSecrets";

export const RETIRED_SERVER_CLIENT_NAMES = [
  "vuu-module-discovery-server",
] as const;

export type ProtocolMapper = {
  name?: string;
  protocol?: string;
  protocolMapper?: string;
  consentRequired?: boolean;
  config?: Record<string, string>;
  [key: string]: unknown;
};

export type ServerClientRepresentation = {
  attributes?: Record<string, string>;
  fullScopeAllowed?: boolean;
  protocolMappers?: ProtocolMapper[];
  secret?: string;
  [key: string]: unknown;
};

export function reconcilePortalClientConfiguration(
  currentClient: ServerClientRepresentation,
): ServerClientRepresentation {
  return {
    ...currentClient,
    fullScopeAllowed: false,
    protocolMappers: reconcileServerAudienceMappers(
      currentClient.protocolMappers ?? [],
    ),
  };
}

export function reconcileServerClientConfiguration(
  currentClient: ServerClientRepresentation,
  clientId: ServerClientName,
  clientSecret?: string,
): ServerClientRepresentation {
  return {
    ...currentClient,
    fullScopeAllowed: false,
    attributes: {
      ...(currentClient.attributes ?? {}),
      "standard.token.exchange.enabled": "true",
    },
    protocolMappers: reconcileSelfAudienceMapper(
      currentClient.protocolMappers ?? [],
      clientId,
    ),
    ...(clientSecret ? { secret: clientSecret } : {}),
  };
}

export function reconcileServerAudienceMappers(
  currentMappers: readonly ProtocolMapper[],
): ProtocolMapper[] {
  return reconcileAudienceMappers(
    currentMappers,
    SERVER_CLIENT_NAMES,
    RETIRED_SERVER_CLIENT_NAMES,
  );
}

export function reconcileSelfAudienceMapper(
  currentMappers: readonly ProtocolMapper[],
  clientId: ServerClientName,
): ProtocolMapper[] {
  return reconcileAudienceMappers(currentMappers, [clientId]);
}

function reconcileAudienceMappers(
  currentMappers: readonly ProtocolMapper[],
  desiredAudienceNames: readonly string[],
  retiredAudienceNames: readonly string[] = [],
): ProtocolMapper[] {
  const desiredAudiences = new Set(desiredAudienceNames);
  const retiredAudiences = new Set(retiredAudienceNames);
  const existingByAudience = new Map(
    currentMappers
      .filter(
        (mapper) =>
          mapper.protocolMapper === "oidc-audience-mapper" &&
          mapper.config?.["included.client.audience"],
      )
      .map((mapper) => [
        mapper.config!["included.client.audience"],
        mapper,
      ]),
  );
  const reconciled = currentMappers.filter((mapper) => {
    const audience = mapper.config?.["included.client.audience"];
    return (
      mapper.protocolMapper !== "oidc-audience-mapper" ||
      !audience ||
      (!desiredAudiences.has(audience) && !retiredAudiences.has(audience))
    );
  });

  for (const audience of desiredAudienceNames) {
    const existingMapper = existingByAudience.get(audience);
    const requiredMapper: ProtocolMapper = {
      name: `audience-${audience}`,
      protocol: "openid-connect",
      protocolMapper: "oidc-audience-mapper",
      consentRequired: false,
      config: {
        "included.client.audience": audience,
        "id.token.claim": "false",
        "access.token.claim": "true",
        "introspection.token.claim": "true",
      },
    };
    reconciled.push({
      ...existingMapper,
      ...requiredMapper,
      config: {
        ...(existingMapper?.config ?? {}),
        ...requiredMapper.config,
      },
    });
  }

  return reconciled;
}
