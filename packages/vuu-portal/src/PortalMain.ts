import {
  ConfigFactory,
  createConfiguredAuthProviders,
  createVuuServerApplication,
} from "@heswell/vuu-server";
import { createModuleRegistry } from "./ModuleRegistry";
import {
  loadModuleAdminRole,
  loadModuleState,
  ModuleDiscoveryModule,
} from "./modules/ModuleDiscovery/ModuleDiscoveryModule";

export default async function main() {
  const defaultConfig = ConfigFactory.load();
  const application = createVuuServerApplication({
    authProviders: createConfiguredAuthProviders(defaultConfig),
    config: defaultConfig,
    defaultHttpsPort: 8443,
    defaultWebSocketPath: "/websocket-portal",
    defaultWebSocketPort: 8091,
    loginSuccessProvider: (user, tableContainer) => ({
      moduleRegistry: createModuleRegistry(tableContainer, user),
    }),
    modules: [
      ModuleDiscoveryModule(loadModuleState(defaultConfig), {
        adminRole: loadModuleAdminRole(defaultConfig),
      }),
    ],
  });

  await application.start();
}
