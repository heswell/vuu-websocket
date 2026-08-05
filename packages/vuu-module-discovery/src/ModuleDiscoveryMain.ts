import {
  ConfigFactory,
  createVuuServerApplication,
  KeycloakAuthProvider,
} from "@heswell/vuu-server";
import { ModuleDiscoveryModule } from "./modules/ModuleDiscovery/ModuleDiscoveryModule";
import { createModuleRegistryHttpHandler } from "./ModuleRegistryHandler";

export default async function main() {
  const defaultConfig = ConfigFactory.load();
  const authProvider = new KeycloakAuthProvider(defaultConfig);
  const application = createVuuServerApplication({
    additionalHttpHandlers: ({ config, getServer }) => [
      createModuleRegistryHttpHandler(
        authProvider,
        () => getServer().tableContainer,
        {
          allowedOrigin: config.getString(
            "vuu.auth.cors.allowedOrigin",
            "http://localhost:5002",
          ),
        },
      ),
    ],
    authProviders: { bearerToken: authProvider },
    config: defaultConfig,
    defaultHttpsPort: 8444,
    defaultWebSocketPort: 8091,
    modules: [ModuleDiscoveryModule()],
  });

  await application.start();
}
