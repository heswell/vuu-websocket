import {
  HttpServerOptions,
  sslEnabled,
  VuuWebSocketOptions,
} from "../../core/VuuServerOptions";

const DEFAULT_REST_HTTPS_PORT = 8443;

export class RestServer {
  constructor(
    { sslOptions }: VuuWebSocketOptions,
    { requestHandler, httpsPort = DEFAULT_REST_HTTPS_PORT }: HttpServerOptions,
  ) {
    if (!requestHandler) {
      return;
    }

    if (!sslEnabled(sslOptions)) {
      throw new Error(
        "REST HTTPS server requires SSL to be enabled in VuuWebSocketOptions",
      );
    }

    const restServer = Bun.serve({
      certFile: sslOptions.certPath,
      keyFile: sslOptions.keyPath,
      port: httpsPort,
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
      `[VUU] REST listening on https://${restServer.hostname}:${restServer.port}`,
    );

    process.on("SIGINT", () => {
      restServer.stop();
    });
  }
}
