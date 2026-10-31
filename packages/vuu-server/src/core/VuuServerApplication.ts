import { Config } from "../util/ConfigFactory";
import { AuthenticationProviders } from "../net/auth/AuthProvider";
import { createAuthHttpHandler } from "../net/auth/AuthHttpHandler";
import { getConfiguredAuthMode } from "../net/auth/ConfiguredAuthProviders";
import { getConfiguredAllowedOrigins } from "../net/http/CorsOrigins";
import { LoginTokenService } from "../net/auth/LoginTokenService";
import { composeHttpHandlers } from "../net/http/composeHttpHandlers";
import {
  AdminRoute,
  createAdminHttpHandler,
} from "../net/http/admin/AdminHttpHandler";
import { createNotificationAdminRoutes } from "../net/http/admin/NotificationAdminRoutes";
import { LifecycleContainer } from "../toolbox/thread/LifecycleContainer";
import { ViewServerModule } from "./module/VsModule";
import { VuuServer } from "./VuuServer";
import { installUnhandledRejectionGuard } from "./UnhandledRejectionGuard";
import {
  HttpRequestHandler,
  HttpServerOptions,
  type SessionLimitPolicy,
  VuuServerConfig,
  VuuSslByCertAndKey,
  VuuWebSocketOptions,
} from "./VuuServerOptions";
import type { LoginSuccessProvider } from "./LoginSuccessProvider";
import { configureLogging, getLogger } from "@heswell/service-utils/browser";

const log = getLogger("vuu.core");

const ConfigKeys = {
  adminEnabled: "vuu.admin.enabled",
  adminNotificationDurationMs: "vuu.admin.notifications.defaultDurationMs",
  adminPath: "vuu.admin.path",
  authPath: "vuu.auth.path",
  certPath: "vuu.certPath",
  httpsPort: "vuu.https.port",
  keyPath: "vuu.keyPath",
  maxSessionsPerUser: "vuu.server.maxSessionsPerUser",
  sessionLimitPolicy: "vuu.server.sessionLimitPolicy",
  unhandledRejectionGuard: "vuu.server.unhandledRejectionGuard",
  sslEnabled: "vuu.ssl",
  websocketPath: "vuu.websocket.path",
  websocketPort: "vuu.websocket.port",
} as const;

export type VuuServerApplicationContext = {
  config: Config;
  getServer: () => VuuServer;
  lifecycle: LifecycleContainer;
  loginTokenService: LoginTokenService;
};

export type VuuServerApplicationOptions = {
  additionalAuthProfiles?: Record<string, AuthenticationProviders>;
  authProviders: AuthenticationProviders;
  config: Config;
  defaultHttpsPort: number;
  defaultWebSocketPath?: string;
  defaultWebSocketPort: number;
  loginSuccessProvider?: LoginSuccessProvider;
  modules: ViewServerModule[];
  additionalHttpHandlers?: (
    context: VuuServerApplicationContext,
  ) => HttpRequestHandler[];
  /**
   * Additional routes for the (unauthenticated, development only) admin api.
   * Only installed when vuu.admin.enabled=true.
   */
  additionalAdminRoutes?: (context: VuuServerApplicationContext) => AdminRoute[];
  /**
   * Install a process-wide unhandledRejection handler on start that logs the
   * rejection at error rather than letting it end the process. Overrides
   * `vuu.server.unhandledRejectionGuard`. Default true, except under
   * `bun test` (NODE_ENV=test) so tests still see such bugs.
   */
  unhandledRejectionGuard?: boolean;
};

export type VuuServerApplication = VuuServerApplicationContext & {
  httpServerOptions: HttpServerOptions;
  server: VuuServer;
  start: () => Promise<void>;
  webSocketOptions: VuuWebSocketOptions;
};

export function createVuuServerApplication({
  additionalAdminRoutes,
  additionalAuthProfiles,
  additionalHttpHandlers,
  authProviders,
  config,
  defaultHttpsPort,
  defaultWebSocketPath = "/websocket",
  defaultWebSocketPort,
  loginSuccessProvider,
  modules,
  unhandledRejectionGuard,
}: VuuServerApplicationOptions): VuuServerApplication {
  configureLogging(config);
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
  const authMode = getConfiguredAuthMode(config);
  const allowedOrigins = getConfiguredAllowedOrigins(config, authMode);
  getLogger("vuu.auth").debug(
    `CORS allowed origins: ${allowedOrigins.join(", ")}`,
  );
  const authHandler = createAuthHttpHandler(
    authProviders,
    loginTokenService,
    {
      allowedOrigins,
      path: config.getString(ConfigKeys.authPath, "/api/authn"),
      profiles: additionalAuthProfiles,
    },
  );
  const handlers = [
    authHandler,
    ...createAdminHttpHandlers(context, additionalAdminRoutes),
    ...(additionalHttpHandlers?.(context) ?? []),
  ];
  const httpServerOptions: HttpServerOptions = {
    authMode,
    httpsPort: config.getNumber(ConfigKeys.httpsPort, defaultHttpsPort),
    requestHandler:
      handlers.length === 1 ? handlers[0] : composeHttpHandlers(...handlers),
  };
  const webSocketOptions = createConfiguredWebSocketOptions(
    config,
    defaultWebSocketPort,
    defaultWebSocketPath,
  );
  const serverConfig = modules.reduce(
    (current, module) => current.withModule(module),
    VuuServerConfig(
      webSocketOptions,
      httpServerOptions,
      loginTokenService,
      [],
      loginSuccessProvider,
    ),
  );

  server = new VuuServer(serverConfig, lifecycle);

  return {
    ...context,
    httpServerOptions,
    server,
    start: async () => {
      if (unhandledRejectionGuardEnabled(config, unhandledRejectionGuard)) {
        installUnhandledRejectionGuard();
      }
      lifecycle.autoShutdownHook();
      await lifecycle.start();
    },
    webSocketOptions,
  };
}

/**
 * The option wins, then `vuu.server.unhandledRejectionGuard`. Off by default
 * under NODE_ENV=test (bun test) so tests still fail on such bugs.
 */
export function unhandledRejectionGuardEnabled(
  config: Config,
  option?: boolean,
) {
  return (
    option ??
    config.getBoolean(
      ConfigKeys.unhandledRejectionGuard,
      process.env.NODE_ENV !== "test",
    )
  );
}

function createAdminHttpHandlers(
  context: VuuServerApplicationContext,
  additionalAdminRoutes: VuuServerApplicationOptions["additionalAdminRoutes"],
): HttpRequestHandler[] {
  const { config, getServer } = context;
  if (!config.getBoolean(ConfigKeys.adminEnabled, false)) {
    return [];
  }
  const path = config.getString(ConfigKeys.adminPath, "/api/admin");
  log.warn(
    `UNAUTHENTICATED admin REST api enabled at ${path} (${ConfigKeys.adminEnabled}=true). Do not enable in production.`,
  );
  const routes = [
    ...createNotificationAdminRoutes(() => getServer().tableContainer, {
      defaultDurationMs: config.getNumber(
        ConfigKeys.adminNotificationDurationMs,
        10_000,
      ),
    }),
    ...(additionalAdminRoutes?.(context) ?? []),
  ];
  return [createAdminHttpHandler(routes, { path })];
}

export function createConfiguredWebSocketOptions(
  config: Config,
  defaultWebSocketPort: number,
  defaultWebSocketPath = "/websocket",
): VuuWebSocketOptions {
  const options = VuuWebSocketOptions()
    .withUri(config.getString(ConfigKeys.websocketPath, defaultWebSocketPath))
    .withWsPort(
      config.getNumber(ConfigKeys.websocketPort, defaultWebSocketPort),
    )
    .withMaxSessionsPerUser(
      config.getNumber(ConfigKeys.maxSessionsPerUser, 1),
      config.getString(
        ConfigKeys.sessionLimitPolicy,
        "evict-oldest",
      ) as SessionLimitPolicy,
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
