import type { LoginTokenService } from "../net/auth/LoginTokenService";
import { ViewServerModule } from "./module/VsModule";
import type { LoginSuccessProvider } from "./LoginSuccessProvider";
import {
  SessionLimitPolicies,
  type SessionLimitPolicy,
} from "../net/ClientSessionContainer";

export type { SessionLimitPolicy };

export type HttpRequestHandler = (
  req: Request,
  url: URL,
) => Promise<Response | undefined> | Response | undefined;

export type HttpServerOptions = {
  /**
   * The effective `vuu.auth.mode`. When SSL is disabled the REST server only
   * starts (over plain HTTP) if this is "permissive".
   */
  authMode?: string;
  /**
   * REST server port (`vuu.https.port`). Used for plain HTTP too when SSL is
   * disabled. Use 0 for an ephemeral port.
   */
  httpsPort?: number;
  requestHandler?: HttpRequestHandler;
};

export interface VuuWebSocketOptions {
  /** Concurrent sessions allowed per user, default 1. */
  maxSessionsPerUser?: number;
  /**
   * What a login beyond maxSessionsPerUser does: "evict-oldest" (default)
   * closes the user's oldest session, "reject-new" refuses the login.
   */
  sessionLimitPolicy?: SessionLimitPolicy;
  sslOptions: VuuSSLOptions;
  uri: string;
  wsPort: number;

  withMaxSessionsPerUser: (
    maxSessionsPerUser: number,
    sessionLimitPolicy?: SessionLimitPolicy,
  ) => VuuWebSocketOptions;
  withSsl: (sslOptions: VuuSslByCertAndKey) => VuuWebSocketOptions;
  withSslDisabled: () => VuuWebSocketOptions;
  withWsPort: (wsPort: number) => VuuWebSocketOptions;
  withUri: (uri: string) => VuuWebSocketOptions;
};

export type VuuSslByCertAndKey = {
  certPath: string;
  keyPath: string;
}
export type VuuSSLOptions = VuuSslByCertAndKey | "ssl-disabled";

export const sslEnabled = (ssl: VuuSSLOptions) : ssl is VuuSslByCertAndKey => ssl !== "ssl-disabled"

export const VuuSslByCertAndKey = (certPath: string,
  keyPath: string): VuuSslByCertAndKey =>  ({certPath, keyPath})

class VuuWebSocketOptionsImpl implements VuuWebSocketOptions {
  constructor(
    public wsPort: number,
    public uri: string,
    public sslOptions: VuuSSLOptions,
    public maxSessionsPerUser: number,
    public sessionLimitPolicy: SessionLimitPolicy,
  ) {}

  withMaxSessionsPerUser = (
    maxSessionsPerUser: number,
    sessionLimitPolicy = this.sessionLimitPolicy,
  ) =>
    VuuWebSocketOptions(
      this.wsPort,
      this.uri,
      this.sslOptions,
      maxSessionsPerUser,
      sessionLimitPolicy,
    );

  withSsl = (sslOptions: VuuSslByCertAndKey) =>
    VuuWebSocketOptions(
      this.wsPort,
      this.uri,
      sslOptions,
      this.maxSessionsPerUser,
      this.sessionLimitPolicy,
    );
  withSslDisabled = () =>
    VuuWebSocketOptions(
      this.wsPort,
      this.uri,
      "ssl-disabled",
      this.maxSessionsPerUser,
      this.sessionLimitPolicy,
    );
  withWsPort = (wsPort: number) =>
    VuuWebSocketOptions(
      wsPort,
      this.uri,
      this.sslOptions,
      this.maxSessionsPerUser,
      this.sessionLimitPolicy,
    );
  withUri = (uri: string) =>
    VuuWebSocketOptions(
      this.wsPort,
      uri,
      this.sslOptions,
      this.maxSessionsPerUser,
      this.sessionLimitPolicy,
    );
}

export const VuuWebSocketOptions = (
  wsPort = 8091,
  uri = "/websocket",
  sslOptions: VuuSSLOptions = "ssl-disabled",
  maxSessionsPerUser = 1,
  sessionLimitPolicy: SessionLimitPolicy = "evict-oldest",
): VuuWebSocketOptions => {
  validateWebSocketPath(uri);
  validateSessionLimit(maxSessionsPerUser, sessionLimitPolicy);
  return new VuuWebSocketOptionsImpl(
    wsPort,
    uri,
    sslOptions,
    maxSessionsPerUser,
    sessionLimitPolicy,
  );
};

function validateSessionLimit(
  maxSessionsPerUser: number,
  sessionLimitPolicy: SessionLimitPolicy,
) {
  if (!Number.isInteger(maxSessionsPerUser) || maxSessionsPerUser < 1) {
    throw new Error(
      `Invalid maxSessionsPerUser '${maxSessionsPerUser}'. Expected a positive integer.`,
    );
  }
  if (!SessionLimitPolicies.includes(sessionLimitPolicy)) {
    throw new Error(
      `Invalid sessionLimitPolicy '${sessionLimitPolicy}'. Expected one of ${SessionLimitPolicies.join(", ")}.`,
    );
  }
}

function validateWebSocketPath(uri: string) {
  if (
    !uri.startsWith("/") ||
    uri.length === 1 ||
    uri.endsWith("/") ||
    uri.includes("?") ||
    uri.includes("#") ||
    uri.includes("://")
  ) {
    throw new Error(
      `Invalid WebSocket path '${uri}'. Expected an absolute URL path without a trailing slash, query, or fragment.`,
    );
  }
}

export interface VuuServerConfig {
  httpServerOptions: HttpServerOptions;
  loginSuccessProvider?: LoginSuccessProvider;
  loginTokenService: LoginTokenService;
  webSocketOptions: VuuWebSocketOptions;
  modules: ViewServerModule[];
  withModule: (module: ViewServerModule) => VuuServerConfig;
}

export function VuuServerConfig(
  webSocketOptions: VuuWebSocketOptions,
  httpServerOptions: HttpServerOptions,
  loginTokenService: LoginTokenService,
  modules: ViewServerModule[] = [],
  loginSuccessProvider?: LoginSuccessProvider,
): VuuServerConfig {
  return {
    httpServerOptions,
    loginSuccessProvider,
    loginTokenService,
    webSocketOptions,
    modules,
    withModule: (module: ViewServerModule) =>
      VuuServerConfig(
        webSocketOptions,
        httpServerOptions,
        loginTokenService,
        modules.concat(module),
        loginSuccessProvider,
      ),
  };
}
