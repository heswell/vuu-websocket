import { isDeepStrictEqual } from "node:util";
import {
  KEYCLOAK_CLIENT_SECRET_ENV as EXISTING_CLIENT_SECRET_ENV,
  LOCAL_KEYCLOAK_CLIENT_SECRETS,
} from "../packages/vuu-server/src/net/auth/KeycloakClientSecrets";

export const SERVER_CLIENT_NAMES = [
  "vuu-portal-server",
  "vuu-user-admin",
  "vuu-basket-trading",
] as const;

export type ServerClientName = (typeof SERVER_CLIENT_NAMES)[number];

export const KEYCLOAK_CLIENT_SECRET_ENV = {
  "vuu-portal-server": EXISTING_CLIENT_SECRET_ENV["vuu-portal-server"],
  "vuu-user-admin": EXISTING_CLIENT_SECRET_ENV["vuu-user-admin"],
  "vuu-basket-trading": EXISTING_CLIENT_SECRET_ENV["vuu-basket-trading"],
} as const;

export const SERVER_CLIENT_SECRETS: Partial<
  Record<ServerClientName, string>
> = {
  "vuu-portal-server": LOCAL_KEYCLOAK_CLIENT_SECRETS["vuu-portal-server"],
  "vuu-user-admin": LOCAL_KEYCLOAK_CLIENT_SECRETS["vuu-user-admin"],
  "vuu-basket-trading": LOCAL_KEYCLOAK_CLIENT_SECRETS["vuu-basket-trading"],
};

export function resolveKeycloakClientSecret(
  clientId: string,
  configuredSecret: string | undefined,
  environment: Record<string, string | undefined> = process.env,
) {
  const envName =
    KEYCLOAK_CLIENT_SECRET_ENV[
      clientId as keyof typeof KEYCLOAK_CLIENT_SECRET_ENV
    ];
  return (envName ? environment[envName] : undefined) ?? configuredSecret;
}

export const RETIRED_SERVER_CLIENT_NAMES = [
  "vuu-module-discovery-server",
  "vuu-module-admin-server",
  "vuu-user-admin-server",
  "vuu-basket-trading-server",
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

export function clientConfigurationsEqual(
  left: ServerClientRepresentation,
  right: ServerClientRepresentation,
) {
  return isDeepStrictEqual(
    withDeterministicMapperOrder(left),
    withDeterministicMapperOrder(right),
  );
}

export function reconcilePortalClientConfiguration(
  currentClient: ServerClientRepresentation,
): ServerClientRepresentation {
  return {
    ...currentClient,
    publicClient: true,
    bearerOnly: false,
    standardFlowEnabled: true,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false,
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
    publicClient: false,
    bearerOnly: false,
    standardFlowEnabled: false,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: true,
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

function withDeterministicMapperOrder(
  client: ServerClientRepresentation,
): ServerClientRepresentation {
  return {
    ...client,
    protocolMappers: client.protocolMappers
      ?.slice()
      .sort((left, right) => mapperKey(left).localeCompare(mapperKey(right))),
  };
}

function mapperKey(mapper: ProtocolMapper) {
  return [
    mapper.protocolMapper ?? "",
    mapper.config?.["included.client.audience"] ?? "",
    mapper.name ?? "",
    String(mapper.id ?? ""),
  ].join("\u0000");
}
