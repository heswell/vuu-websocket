import { LoginTokenService } from "../net/auth/LoginTokenService";
import { ViewServerModule } from "./module/VsModule";

export type HttpRequestHandler = (
  req: Request,
  url: URL,
) => Promise<Response | undefined> | Response | undefined;

export type HttpServerOptions = {
  httpsPort?: number;
  requestHandler?: HttpRequestHandler;
};

export interface VuuWebSocketOptions  {
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

class VuuWebSocketOptionsImpl implements  VuuWebSocketOptions {
  constructor(
    public wsPort: number, 
    public uri: string, 
    public sslOptions: VuuSSLOptions,
    public maxSessionsPerUser: number
  ){}

  withSsl =  (sslOptions: VuuSslByCertAndKey) => VuuWebSocketOptions(this.wsPort, this.uri, sslOptions, this.maxSessionsPerUser);
  withSslDisabled =  () => VuuWebSocketOptions(this.wsPort, this.uri, "ssl-disabled", this.maxSessionsPerUser);
  withWsPort = (wsPort: number) => VuuWebSocketOptions(wsPort, this.uri,this.sslOptions, this.maxSessionsPerUser);
  withUri = (uri: string) => VuuWebSocketOptions(this.wsPort, uri, this.sslOptions, this.maxSessionsPerUser);
}

export const VuuWebSocketOptions = (wsPort = 8090, 
    uri = "/websocket", 
    sslOptions: VuuSSLOptions = "ssl-disabled",
    maxSessionsPerUser = 1) : VuuWebSocketOptions =>
  new VuuWebSocketOptionsImpl(wsPort, uri, sslOptions, maxSessionsPerUser);

export interface VuuServerConfig {
  httpServerOptions: HttpServerOptions;
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
): VuuServerConfig {
  return {
    httpServerOptions,
    loginTokenService,
    webSocketOptions,
    modules,
    withModule: (module: ViewServerModule) =>
      VuuServerConfig(
        webSocketOptions,
        httpServerOptions,
        loginTokenService,
        modules.concat(module),
      ),
  };
}
