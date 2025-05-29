import { Module } from "./Module";

export type HttpServerOptions = {};
export type WebSocketOptions = {
  websocketPort: string | number;
};

export const httpServerOptions = (
  options: HttpServerOptions
): HttpServerOptions => {
  return {};
};

export const webSocketOptions = (
  options: WebSocketOptions
): WebSocketOptions => {
  return {};
};

export type VuuServerConfig = {
  modules: Module[];
  httpServerOptions: HttpServerOptions;
  websocketOptions: WebSocketOptions;
  withModule: (module: Module) => VuuServerConfig;
};

export class VuuServerConfigImpl implements VuuServerConfig {
  constructor(
    public httpServerOptions: HttpServerOptions,
    public websocketOptions: WebSocketOptions,
    public modules: Module[] = []
  ) {}
  withModule(module: Module) {
    return new VuuServerConfigImpl(
      this.httpServerOptions,
      this.websocketOptions,
      this.modules.concat(module)
    );
  }
}

export const VuuServerConfig = (
  httpServerOptions: HttpServerOptions,
  websocketOptions: WebSocketOptions
): VuuServerConfig =>
  new VuuServerConfigImpl(httpServerOptions, websocketOptions);
