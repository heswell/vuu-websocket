import { LoginTokenService } from "../net/auth/LoginTokenService";
import { ViewServerModule } from "./module/VsModule";
import type { LoginSuccessProvider } from "./LoginSuccessProvider";

export type HttpRequestHandler = (
  req: Request,
  url: URL,
) => Promise<Response | undefined> | Response | undefined;

export type HttpServerOptions = {
  httpsPort?: number;
  requestHandler?: HttpRequestHandler;
};

export interface VuuWebSocketOptions {
  maxSessionsPerUser?: number;
  sslOptions: VuuSSLOptions;
  uri: string;
  wsPort: number;

  withSsl: (sslOptions: VuuSslByCertAndKey) => VuuWebSocketOptions;
  withSslDisabled: () => VuuWebSocketOptions;
  withWsPort: (wsPort: number) => VuuWebSocketOptions;
  withUri: (uri: string) => VuuWebSocketOptions;
};

type VuuSslByCertAndKey = {
  certPath: string;
  keyPath: string;
}
type VuuSSLOptions = VuuSslByCertAndKey | "ssl-disabled";

export const sslEnabled = (ssl: VuuSSLOptions) : ssl is VuuSslByCertAndKey => ssl !== "ssl-disabled"

export const VuuSslByCertAndKey = (certPath: string,
  keyPath: string): VuuSslByCertAndKey =>  ({certPath, keyPath})

class VuuWebSocketOptionsImpl implements VuuWebSocketOptions {
  constructor(
    public wsPort: number,
    public uri: string,
    public sslOptions: VuuSSLOptions,
    public maxSessionsPerUser: number,
  ) {}

  withSsl = (sslOptions: VuuSslByCertAndKey) =>
    VuuWebSocketOptions(
      this.wsPort,
      this.uri,
      sslOptions,
      this.maxSessionsPerUser,
    );
  withSslDisabled = () =>
    VuuWebSocketOptions(
      this.wsPort,
      this.uri,
      "ssl-disabled",
      this.maxSessionsPerUser,
    );
  withWsPort = (wsPort: number) =>
    VuuWebSocketOptions(
      wsPort,
      this.uri,
      this.sslOptions,
      this.maxSessionsPerUser,
    );
  withUri = (uri: string) =>
    VuuWebSocketOptions(
      this.wsPort,
      uri,
      this.sslOptions,
      this.maxSessionsPerUser,
    );
}

export const VuuWebSocketOptions = (
  wsPort = 8091,
  uri = "/websocket",
  sslOptions: VuuSSLOptions = "ssl-disabled",
  maxSessionsPerUser = 1,
): VuuWebSocketOptions => {
  validateWebSocketPath(uri);
  return new VuuWebSocketOptionsImpl(wsPort, uri, sslOptions, maxSessionsPerUser);
};

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
