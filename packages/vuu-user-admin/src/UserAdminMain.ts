import {
  ConfigFactory,
  createConfiguredAuthProviders,
  createVuuServerApplication,
} from "@heswell/vuu-server";
import {
  createUserAdminFeature,
} from "@heswell/user-admin";
import { KeycloakAdminClient } from "./keycloak/KeycloakAdminClient";
import {
  getKeycloakAdminSnapshot,
  refreshKeycloakAdminSnapshot,
} from "./keycloak/KeycloakAdminSnapshotStore";

export default async function main() {
  const defaultConfig = ConfigFactory.load();
  const userAdmin = createUserAdminFeature({
    createOperations: KeycloakAdminClient.createFromConfig,
    refreshSnapshot: refreshKeycloakAdminSnapshot,
    snapshotSource: getKeycloakAdminSnapshot,
  });
  const application = createVuuServerApplication({
    authProviders: createConfiguredAuthProviders(defaultConfig),
    config: defaultConfig,
    defaultHttpsPort: 8444,
    defaultWebSocketPath: "/websocket-user-admin",
    defaultWebSocketPort: 8092,
    modules: [userAdmin.module],
  });
  const refreshCoordinator = userAdmin.install(
    application.server.tableContainer,
    application.server.providers,
  );
  refreshCoordinator.startPeriodicRefresh(
    defaultConfig.getNumber("vuu.keycloak.sync.intervalMs", 10_000),
  );

  await application.start();
}
