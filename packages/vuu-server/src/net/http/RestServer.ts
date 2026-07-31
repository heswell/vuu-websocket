import {
  HttpServerOptions,
  sslEnabled,
  VuuWebSocketOptions,
} from "../../core/VuuServerOptions";

const DEFAULT_REST_HTTPS_PORT = 8443;

export class RestServer {
  #server: Bun.Server<unknown> | undefined;

  constructor(
    private readonly webSocketOptions: VuuWebSocketOptions,
    private readonly httpServerOptions: HttpServerOptions,
  ) {}

  start() {
    if (this.#server) {
      return;
    }
    const { sslOptions } = this.webSocketOptions;
    const {
      requestHandler,
      httpsPort = DEFAULT_REST_HTTPS_PORT,
    } = this.httpServerOptions;
    if (!requestHandler) {
      return;
    }

    if (!sslEnabled(sslOptions)) {
      throw new Error(
        "REST HTTPS server requires SSL to be enabled in VuuWebSocketOptions",
      );
    }

    this.#server = Bun.serve({
      port: httpsPort,
      tls: {
        cert: Bun.file(sslOptions.certPath),
        key: Bun.file(sslOptions.keyPath),
      },
      async fetch(req) {
        const url = new URL(req.url);
        const response = await requestHandler(req, url);
        if (response) {
          return response;
        }

        return new Response("Not found", { status: 404 });
      },
    });

    console.log(
      `[VUU] REST listening on https://${this.#server.hostname}:${this.#server.port}`,
    );
  }

  async stop() {
    const server = this.#server;
    if (!server) {
      return;
    }
    this.#server = undefined;
    await server.stop(true);
  }
}
