import {
  Config,
  ConfigFactory,
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
  registryPort: "vuu.moduleRegistry.port",
} as const;

export default async function main() {
  const config = ConfigFactory.load();
  const lifecycle = new LifecycleContainer();
  const authnProvider = new KeycloakAuthProvider(config);
  let vuuServer: VuuServer | undefined;

  const serverConfig = VuuServerConfig(
    createWebSocketOptions(config),
    {
      httpsPort: config.getNumber(ConfigKeys.registryPort, 8443),
      requestHandler: createModuleRegistryHttpHandler(authnProvider, () => {
        if (!vuuServer) {
          throw new Error("Module-discovery server has not been initialized");
        }
        return vuuServer.tableContainer;
      }),
    },
    LoginTokenService(),
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
