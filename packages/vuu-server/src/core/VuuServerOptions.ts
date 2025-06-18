import { ViewServerModule } from "./module/VsModule";

export type HttpServerOptions = {};
export type WebSocketOptions = {
  webSocketPort: string | number;
};

export interface VuuServerConfig {
  httpServerOptions: HttpServerOptions;
  webSocketOptions: WebSocketOptions;
  modules: ViewServerModule[];
  withModule: (module: ViewServerModule) => VuuServerConfig;
}

export function VuuServerConfig(
  httpServerOptions: HttpServerOptions,
  webSocketOptions: WebSocketOptions,
  modules: ViewServerModule[] = []
): VuuServerConfig {
  return {
    httpServerOptions,
    webSocketOptions,
    modules,
    withModule: (module: ViewServerModule) =>
      VuuServerConfig(
        httpServerOptions,
        webSocketOptions,
        modules.concat(module)
      ),
  };
}
