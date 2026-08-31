import {
  ConfigFactory,
  createConfiguredAuthProviders,
  createVuuServerApplication,
  KeycloakAuthProvider,
  LOCAL_KEYCLOAK_CLIENT_SECRETS,
} from "@heswell/vuu-server";
import { createModuleRegistry } from "./ModuleRegistry";
import { ModuleDiscoveryModule } from "./modules/ModuleDiscovery/ModuleDiscoveryModule";

export default async function main() {
  const defaultConfig = ConfigFactory.load();
  const application = createVuuServerApplication({
    additionalAuthProfiles: {
      "module-admin": {
        bearerToken: new KeycloakAuthProvider(defaultConfig, {
          audience: "vuu-module-admin-server",
          audiencePolicy: "always-exchange",
          authorizationClientId: "vuu-module-admin-server",
          clientId: "vuu-module-admin-server",
          clientSecret:
            LOCAL_KEYCLOAK_CLIENT_SECRETS["vuu-module-admin-server"],
          expectedAuthorizedParty: "vuu-module-admin-server",
          tokenExchangeEnabled: true,
        }),
      },
    },
    authProviders: createConfiguredAuthProviders(defaultConfig),
    config: defaultConfig,
    defaultHttpsPort: 8443,
    defaultWebSocketPort: 8091,
    loginSuccessProvider: (user, tableContainer) => ({
      moduleRegistry: createModuleRegistry(tableContainer, user),
    }),
    modules: [ModuleDiscoveryModule()],
  });

  await application.start();
}
