import {
  ConfigFactory,
  createConfiguredAuthProviders,
  createVuuServerApplication,
} from "@heswell/vuu-server";
import { KeycloakAdminModule } from "./modules/keycloak-admin";
import { installKeycloakAdminRefreshCoordinator } from "./modules/keycloak-admin/KeycloakAdminRefreshCoordinator";

export default async function main() {
  const defaultConfig = ConfigFactory.load();
  const application = createVuuServerApplication({
    authProviders: createConfiguredAuthProviders(defaultConfig),
    config: defaultConfig,
    defaultHttpsPort: 8444,
    defaultWebSocketPath: "/websocket-user-admin",
    defaultWebSocketPort: 8092,
    modules: [KeycloakAdminModule()],
  });
  const refreshCoordinator = installKeycloakAdminRefreshCoordinator(
    application.server.tableContainer,
    application.server.providers,
  );
  refreshCoordinator.startPeriodicRefresh(
    defaultConfig.getNumber("vuu.keycloak.sync.intervalMs", 10_000),
  );

  await application.start();
}
