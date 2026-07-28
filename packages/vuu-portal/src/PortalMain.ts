import {
  Config,
  ConfigFactory,
  createAuthnHttpHandler,
  HttpServerOptions,
  LifecycleContainer,
  LoginTokenService,
  VuuServer,
  VuuServerConfig,
  VuuSslByCertAndKey,
  VuuWebSocketOptions,
} from "@heswell/vuu-server";
import { createAuthnProvider } from "./auth/createAuthnProvider";
import { KeycloakAdminModule } from "./modules/keycloak-admin";
import { LifeCycleRunner } from "@heswell/vuu-server/src/toolbox/thread/LifeCycleRunner";
import { installKeycloakAdminRefreshCoordinator } from "./modules/keycloak-admin/KeycloakAdminRefreshCoordinator";

const ConfigKeys = {
  sslEnabled: "vuu.ssl",
  certPath: "vuu.certPath",
  keyPath: "vuu.keyPath",
  port: "vuu.port",
  keycloakSyncIntervalMs: "vuu.keycloak.sync.intervalMs",
} as const;

function createWebSocketOptions(config: Config): VuuWebSocketOptions {
  const options = VuuWebSocketOptions()
    .withUri("websocket")
    .withWsPort(config.getNumber(ConfigKeys.port, 8091));

  if (config.getBoolean(ConfigKeys.sslEnabled)) {
    return options.withSsl(
      VuuSslByCertAndKey(
        config.getPath(ConfigKeys.certPath),
        config.getPath(ConfigKeys.keyPath),
      ),
    );
  }

  return options.withSslDisabled();
}

export default function main() {
  const defaultConfig = ConfigFactory.load();
  const authnProvider = createAuthnProvider(defaultConfig);
  const loginTokenService = LoginTokenService();
  const httpServerOptions: HttpServerOptions = {
    httpsPort: 8443,
    requestHandler: createAuthnHttpHandler(authnProvider, loginTokenService),
  };
  const lifecycle = new LifecycleContainer();

  const config = VuuServerConfig(
    createWebSocketOptions(defaultConfig),
    httpServerOptions,
    loginTokenService,
  ).withModule(KeycloakAdminModule());

  // Constructing VuuServer starts providers and websocket endpoint.
  const vuuServer = new VuuServer(config, lifecycle);
  const refreshCoordinator = installKeycloakAdminRefreshCoordinator(
    vuuServer.tableContainer,
    vuuServer.providers,
  );
  const syncIntervalMs = defaultConfig.getNumber(
    ConfigKeys.keycloakSyncIntervalMs,
    10_000,
  );
  lifecycle.apply(
    new LifeCycleRunner(
      "keycloak-admin-refresh",
      () => {
        void refreshCoordinator.refreshAll("scheduled").catch((error) => {
          console.error(
            `[PortalMain] keycloak admin refresh failed: ${(error as Error).message}`,
          );
        });
      },
      syncIntervalMs,
    ),
  );

  lifecycle.start();
}
