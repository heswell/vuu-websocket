import {
  ConfigFactory,
  createVuuServerApplication,
} from "@heswell/vuu-server";
import { createAuthProvider } from "./auth/createAuthProvider";
import { KeycloakAdminModule } from "./modules/keycloak-admin";
import { installKeycloakAdminRefreshCoordinator } from "./modules/keycloak-admin/KeycloakAdminRefreshCoordinator";

export default async function main() {
  const defaultConfig = ConfigFactory.load();
  const authProvider = createAuthProvider(defaultConfig);
  const application = createVuuServerApplication({
    authProviders: authProvider,
    config: defaultConfig,
    defaultHttpsPort: 8443,
    defaultWebSocketPort: 8091,
    modules: [KeycloakAdminModule()],
  });
  installKeycloakAdminRefreshCoordinator(
    application.server.tableContainer,
    application.server.providers,
  );

  await application.start();
}
