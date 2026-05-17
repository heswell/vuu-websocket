import { LoginTokenService } from "../net/auth/LoginTokenService";
import { ViewServerModule } from "./module/VsModule";

export type HttpServerOptions = {};
export type VuuWebSocketOptions = {
  certPath?: string;
  maxSessionsPerUser?: number;
  webSocketPort: string | number;
};

export interface VuuServerConfig {
  httpServerOptions: HttpServerOptions;
  loginTokenService: LoginTokenService;
  webSocketOptions: VuuWebSocketOptions;
  modules: ViewServerModule[];
  withModule: (module: ViewServerModule) => VuuServerConfig;
}

export function VuuServerConfig(
  httpServerOptions: HttpServerOptions,
  webSocketOptions: VuuWebSocketOptions,
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
        httpServerOptions,
        webSocketOptions,
        loginTokenService,
        modules.concat(module),
      ),
  };
}
