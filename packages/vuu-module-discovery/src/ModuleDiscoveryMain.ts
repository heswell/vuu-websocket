import {
  Config,
  ConfigFactory,
  composeHttpHandlers,
  createAuthHttpHandler,
  KeycloakAuthProvider,
  LifecycleContainer,
  LoginTokenService,
  VuuServer,
  VuuServerConfig,
  VuuSslByCertAndKey,
  VuuWebSocketOptions,
} from "@heswell/vuu-server";
import { ModuleDiscoveryModule } from "./ModuleDiscoveryModule";
import { createModuleRegistryHttpHandler } from "./ModuleRegistryHandler";

const ConfigKeys = {
  sslEnabled: "vuu.ssl",
  certPath: "vuu.certPath",
  keyPath: "vuu.keyPath",
  port: "vuu.port",
  authCorsAllowedOrigin: "vuu.auth.cors.allowedOrigin",
  authPath: "vuu.auth.path",
  registryPort: "vuu.moduleRegistry.port",
} as const;

export default async function main() {
  const defaultConfig = ConfigFactory.load();
  const lifecycle = new LifecycleContainer();
  const authProvider = new KeycloakAuthProvider(defaultConfig);
  const loginTokenService = LoginTokenService();
  let vuuServer: VuuServer | undefined;

  const serverConfig = VuuServerConfig(
    createWebSocketOptions(defaultConfig),
    {
      httpsPort: defaultConfig.getNumber(ConfigKeys.registryPort, 8443),
      requestHandler: composeHttpHandlers(
        createAuthHttpHandler(
          { bearerToken: authProvider },
          loginTokenService,
          {
            allowedOrigin: defaultConfig.getString(
              ConfigKeys.authCorsAllowedOrigin,
              "http://localhost:5002",
            ),
            path: defaultConfig.getString(ConfigKeys.authPath, "/api/authn"),
          },
        ),
        createModuleRegistryHttpHandler(
          authProvider,
          () => {
            if (!vuuServer) {
              throw new Error(
                "Module-discovery server has not been initialized",
              );
            }
            return vuuServer.tableContainer;
          },
          {
            allowedOrigin: defaultConfig.getString(
              ConfigKeys.authCorsAllowedOrigin,
              "http://localhost:5002",
            ),
          },
        ),
      ),
    },
    loginTokenService,
  ).withModule(ModuleDiscoveryModule());

  vuuServer = new VuuServer(serverConfig, lifecycle);
  lifecycle.autoShutdownHook();
  await lifecycle.start();
}

function createWebSocketOptions(config: Config): VuuWebSocketOptions {
  const options = VuuWebSocketOptions()
    .withUri("websocket")
    .withWsPort(config.getNumber(ConfigKeys.port, 8091));

  return config.getBoolean(ConfigKeys.sslEnabled)
    ? options.withSsl(
      VuuSslByCertAndKey(
        config.getPath(ConfigKeys.certPath),
        config.getPath(ConfigKeys.keyPath),
      ),
    )
    : options.withSslDisabled();
}
