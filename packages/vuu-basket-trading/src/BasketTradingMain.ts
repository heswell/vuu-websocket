import {
  Config,
  ConfigFactory,
  LifecycleContainer,
  LoginTokenService,
  VuuServer,
  VuuServerConfig,
  VuuSslByCertAndKey,
  VuuWebSocketOptions,
} from "@heswell/vuu-server";
import { BasketModule } from "./modules/basket/BasketModule";

const ConfigKeys = {
  certPath: "vuu.certPath",
  keyPath: "vuu.keyPath",
  sslEnabled: "vuu.ssl",
  websocketPort: "vuu.websocket.port",
} as const;

export default async function main() {
  const config = ConfigFactory.load();
  const lifecycle = new LifecycleContainer();
  const serverConfig = VuuServerConfig(
    createWebSocketOptions(config),
    {},
    LoginTokenService(),
  ).withModule(BasketModule());

  new VuuServer(serverConfig, lifecycle);
  lifecycle.autoShutdownHook();
  await lifecycle.start();
}

function createWebSocketOptions(config: Config): VuuWebSocketOptions {
  const options = VuuWebSocketOptions()
    .withUri("websocket")
    .withWsPort(config.getNumber(ConfigKeys.websocketPort, 8093));

  return config.getBoolean(ConfigKeys.sslEnabled, false)
    ? options.withSsl(
        VuuSslByCertAndKey(
          config.getPath(ConfigKeys.certPath),
          config.getPath(ConfigKeys.keyPath),
        ),
      )
    : options.withSslDisabled();
}
