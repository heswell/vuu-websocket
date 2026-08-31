export const KEYCLOAK_CLIENT_SECRET_ENV = {
  "vuu-portal-server": "VUU_PORTAL_SERVER_CLIENT_SECRET",
  "vuu-module-admin-server": "VUU_MODULE_ADMIN_SERVER_CLIENT_SECRET",
  "vuu-user-admin-server": "VUU_USER_ADMIN_SERVER_CLIENT_SECRET",
  "vuu-basket-trading-server": "VUU_BASKET_TRADING_SERVER_CLIENT_SECRET",
} as const;

export type VuuKeycloakClientId = keyof typeof KEYCLOAK_CLIENT_SECRET_ENV;

export const LOCAL_KEYCLOAK_CLIENT_SECRETS: Record<
  VuuKeycloakClientId,
  string
> = {
  "vuu-portal-server": "vuu-portal-local-dev-secret",
  "vuu-module-admin-server": "vuu-module-admin-local-dev-secret",
  "vuu-user-admin-server": "vuu-user-admin-local-dev-secret",
  "vuu-basket-trading-server": "vuu-basket-trading-local-dev-secret",
};

export function resolveKeycloakClientSecret(
  clientId: string,
  configuredSecret: string,
  environment: Record<string, string | undefined> = process.env,
) {
  const envName = KEYCLOAK_CLIENT_SECRET_ENV[clientId as VuuKeycloakClientId];
  return (envName ? environment[envName] : undefined) ?? configuredSecret;
}
