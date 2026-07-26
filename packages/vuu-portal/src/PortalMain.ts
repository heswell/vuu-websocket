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
  new VuuServer(config, lifecycle);

  lifecycle.start();
}
