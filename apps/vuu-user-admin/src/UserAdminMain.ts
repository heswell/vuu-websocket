import {
  ConfigFactory,
  createConfiguredAuthProviders,
  createVuuServerApplication,
  NotificationModule,
  NullProvider,
  PermissionFilter,
  ViewPortDef,
} from "@heswell/vuu-server";
import { createUserAdminFeature } from "./modules/user-admin";
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
    modules: [
      userAdmin.module,
      NotificationModule(
        (table) => new NullProvider(table),
        (viewport) =>
          PermissionFilter("audience", new Set(["all", viewport.user.name])),
        (table) => ViewPortDef.default(table.tableDef.columns),
      ),
    ],
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
