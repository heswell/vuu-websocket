import { Config } from "../util/ConfigFactory";
import { AuthenticationProviders } from "../net/auth/AuthProvider";
import { createAuthHttpHandler } from "../net/auth/AuthHttpHandler";
import { LoginTokenService } from "../net/auth/LoginTokenService";
import { composeHttpHandlers } from "../net/http/composeHttpHandlers";
import { LifecycleContainer } from "../toolbox/thread/LifecycleContainer";
import { ViewServerModule } from "./module/VsModule";
import { VuuServer } from "./VuuServer";
import {
  HttpRequestHandler,
  HttpServerOptions,
  VuuServerConfig,
  VuuSslByCertAndKey,
  VuuWebSocketOptions,
} from "./VuuServerOptions";

const ConfigKeys = {
  authCorsAllowedOrigin: "vuu.auth.cors.allowedOrigin",
  authPath: "vuu.auth.path",
  certPath: "vuu.certPath",
  httpsPort: "vuu.https.port",
  keyPath: "vuu.keyPath",
  sslEnabled: "vuu.ssl",
  websocketPort: "vuu.websocket.port",
} as const;

export type VuuServerApplicationContext = {
  config: Config;
  getServer: () => VuuServer;
  lifecycle: LifecycleContainer;
  loginTokenService: LoginTokenService;
};

export type VuuServerApplicationOptions = {
  authProviders: AuthenticationProviders;
  config: Config;
  defaultHttpsPort: number;
  defaultWebSocketPort: number;
  modules: ViewServerModule[];
  additionalHttpHandlers?: (
    context: VuuServerApplicationContext,
  ) => HttpRequestHandler[];
};

export type VuuServerApplication = VuuServerApplicationContext & {
  httpServerOptions: HttpServerOptions;
  server: VuuServer;
  start: () => Promise<void>;
  webSocketOptions: VuuWebSocketOptions;
};

export function createVuuServerApplication({
  additionalHttpHandlers,
  authProviders,
  config,
  defaultHttpsPort,
  defaultWebSocketPort,
  modules,
}: VuuServerApplicationOptions): VuuServerApplication {
  const lifecycle = new LifecycleContainer();
  const loginTokenService = LoginTokenService();
  let server: VuuServer | undefined;
  const getServer = () => {
    if (!server) {
      throw new Error("VUU server has not been initialized");
    }
    return server;
  };
  const context: VuuServerApplicationContext = {
    config,
    getServer,
    lifecycle,
    loginTokenService,
  };
  const authHandler = createAuthHttpHandler(
    authProviders,
    loginTokenService,
    {
      allowedOrigin: config.getString(
        ConfigKeys.authCorsAllowedOrigin,
        "http://localhost:5002",
      ),
      path: config.getString(ConfigKeys.authPath, "/api/authn"),
    },
  );
  const handlers = [
    authHandler,
    ...(additionalHttpHandlers?.(context) ?? []),
  ];
  const httpServerOptions: HttpServerOptions = {
    httpsPort: config.getNumber(ConfigKeys.httpsPort, defaultHttpsPort),
    requestHandler:
      handlers.length === 1 ? handlers[0] : composeHttpHandlers(...handlers),
  };
  const webSocketOptions = createConfiguredWebSocketOptions(
    config,
    defaultWebSocketPort,
  );
  const serverConfig = modules.reduce(
    (current, module) => current.withModule(module),
    VuuServerConfig(
      webSocketOptions,
      httpServerOptions,
      loginTokenService,
    ),
  );

  server = new VuuServer(serverConfig, lifecycle);

  return {
    ...context,
    httpServerOptions,
    server,
    start: async () => {
      lifecycle.autoShutdownHook();
      await lifecycle.start();
    },
    webSocketOptions,
  };
}

export function createConfiguredWebSocketOptions(
  config: Config,
  defaultWebSocketPort: number,
): VuuWebSocketOptions {
  const options = VuuWebSocketOptions()
    .withUri("websocket")
    .withWsPort(
      config.getNumber(ConfigKeys.websocketPort, defaultWebSocketPort),
    );

  return config.getBoolean(ConfigKeys.sslEnabled, false)
    ? options.withSsl(
        VuuSslByCertAndKey(
          config.getPath(ConfigKeys.certPath),
          config.getPath(ConfigKeys.keyPath),
        ),
      )
    : options.withSslDisabled();
}
