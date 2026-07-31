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
import { LifeCycleRunner } from "@heswell/vuu-server";
import { installKeycloakAdminRefreshCoordinator } from "./modules/keycloak-admin/KeycloakAdminRefreshCoordinator";

const ConfigKeys = {
  sslEnabled: "vuu.ssl",
  certPath: "vuu.certPath",
  keyPath: "vuu.keyPath",
  port: "vuu.port",
  authCorsAllowedOrigin: "vuu.auth.cors.allowedOrigin",
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

export default async function main() {
  const defaultConfig = ConfigFactory.load();
  const authnProvider = createAuthnProvider(defaultConfig);
  const loginTokenService = LoginTokenService();
  const httpServerOptions: HttpServerOptions = {
    httpsPort: 8443,
    requestHandler: createAuthnHttpHandler(authnProvider, loginTokenService, {
      allowedOrigin: defaultConfig.getString(
        ConfigKeys.authCorsAllowedOrigin,
        "http://localhost:5002",
      ),
    }),
  };
  const lifecycle = new LifecycleContainer();

  const config = VuuServerConfig(
    createWebSocketOptions(defaultConfig),
    httpServerOptions,
    loginTokenService,
  ).withModule(KeycloakAdminModule());

  const vuuServer = new VuuServer(config, lifecycle);
  const refreshCoordinator = installKeycloakAdminRefreshCoordinator(
    vuuServer.tableContainer,
    vuuServer.providers,
  );
  const syncIntervalMs = defaultConfig.getNumber(
    ConfigKeys.keycloakSyncIntervalMs,
    10_000,
  );
  const refreshRunner = new LifeCycleRunner(
    "keycloak-admin-refresh",
    () => refreshCoordinator.refreshAll("scheduled"),
    syncIntervalMs,
  );
  lifecycle.apply(refreshRunner).dependsOn(vuuServer);

  lifecycle.autoShutdownHook();
  await lifecycle.start();
}
