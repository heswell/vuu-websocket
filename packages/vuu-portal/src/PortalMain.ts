import {
  Config,
  ConfigFactory,
  LifecycleContainer,
  VuuServer,
  VuuServerConfig,
  VuuSslByCertAndKey,
  VuuWebSocketOptions,
} from "@heswell/vuu-server";
import { LoginTokenService } from "@heswell/vuu-server/src/net/auth/LoginTokenService";
import { KeycloakAdminModule } from "./modules/keycloak-admin";

const ConfigKeys = {
  sslEnabled: "vuu.ssl",
  certPath: "vuu.certPath",
  keyPath: "vuu.keyPath",
} as const;

function createWebSocketOptions(config: Config): VuuWebSocketOptions {
  const options = VuuWebSocketOptions().withUri("websocket").withWsPort(8090);

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
  const httpServerOptions = {};
  const loginTokenService = LoginTokenService();
  const defaultConfig = ConfigFactory.load();
  const lifecycle = new LifecycleContainer();

  const config = VuuServerConfig(
    createWebSocketOptions(defaultConfig),
    httpServerOptions,
    loginTokenService,
  ).withModule(KeycloakAdminModule());

  // Constructing VuuServer starts providers and websocket endpoint.
  new VuuServer(config, lifecycle);

  lifecycle.start();
}
