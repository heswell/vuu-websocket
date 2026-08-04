import {
  Config,
  ConfigFactory,
  createAuthHttpHandler,
  HttpServerOptions,
  LifecycleContainer,
  LoginTokenService,
  VuuServer,
  VuuServerConfig,
  VuuSslByCertAndKey,
  VuuWebSocketOptions,
} from "@heswell/vuu-server";
import { createAuthProvider } from "./auth/createAuthProvider";
import { KeycloakAdminModule } from "./modules/keycloak-admin";
import { LifeCycleRunner } from "@heswell/vuu-server";
import { installKeycloakAdminRefreshCoordinator } from "./modules/keycloak-admin/KeycloakAdminRefreshCoordinator";

const ConfigKeys = {
  sslEnabled: "vuu.ssl",
  certPath: "vuu.certPath",
  httpsPort: "vuu.https.port",
  keyPath: "vuu.keyPath",
  websocketPort: "vuu.websocket.port",
  authCorsAllowedOrigin: "vuu.auth.cors.allowedOrigin",
  authPath: "vuu.auth.path",
  keycloakSyncIntervalMs: "vuu.keycloak.sync.intervalMs",
} as const;

export default async function main() {
  const defaultConfig = ConfigFactory.load();
  const authProvider = createAuthProvider(defaultConfig);
  const loginTokenService = LoginTokenService();
  const httpServerOptions: HttpServerOptions = {
    httpsPort: defaultConfig.getNumber(ConfigKeys.httpsPort, 8443),
    requestHandler: createAuthHttpHandler(authProvider, loginTokenService, {
      allowedOrigin: defaultConfig.getString(
        ConfigKeys.authCorsAllowedOrigin,
        "http://localhost:5002",
      ),
      path: defaultConfig.getString(ConfigKeys.authPath, "/api/authn"),
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
  // const refreshRunner = new LifeCycleRunner(
  //   "keycloak-admin-refresh",
  //   () => refreshCoordinator.refreshAll("scheduled"),
  //   syncIntervalMs,
  // );
  // lifecycle.apply(refreshRunner).dependsOn(vuuServer);

  lifecycle.autoShutdownHook();
  await lifecycle.start();
}

function createWebSocketOptions(config: Config): VuuWebSocketOptions {
  const options = VuuWebSocketOptions()
    .withUri("websocket")
    .withWsPort(config.getNumber(ConfigKeys.websocketPort, 8091));

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
