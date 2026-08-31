export const SERVER_CLIENT_NAMES = [
  "vuu-portal-server",
  "vuu-user-admin-server",
  "vuu-basket-trading-server",
] as const;

export const SERVER_CLIENT_SECRETS: Partial<
  Record<(typeof SERVER_CLIENT_NAMES)[number], string>
> = {
  "vuu-user-admin-server": "vuu-user-admin-local-dev-secret",
};

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

export function reconcileServerAudienceMappers(
  currentMappers: readonly ProtocolMapper[],
): ProtocolMapper[] {
  const desiredAudiences = new Set<string>(SERVER_CLIENT_NAMES);
  const retiredAudiences = new Set<string>(RETIRED_SERVER_CLIENT_NAMES);
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

  for (const serverClientName of SERVER_CLIENT_NAMES) {
    const existingMapper = existingByAudience.get(serverClientName);
    const requiredMapper: ProtocolMapper = {
      name: `audience-${serverClientName}`,
      protocol: "openid-connect",
      protocolMapper: "oidc-audience-mapper",
      consentRequired: false,
      config: {
        "included.client.audience": serverClientName,
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
