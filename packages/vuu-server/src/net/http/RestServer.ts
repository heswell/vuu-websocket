import {
  HttpServerOptions,
  sslEnabled,
  VuuWebSocketOptions,
} from "../../core/VuuServerOptions";
import { getLogger } from "@heswell/service-utils";

const log = getLogger("vuu.net");

const DEFAULT_REST_HTTPS_PORT = 8443;

export const PLAIN_HTTP_REST_REQUIRES_PERMISSIVE_AUTH =
  'REST auth over plain HTTP is only allowed with vuu.auth.mode="permissive"; set vuu.ssl=true with vuu.certPath/vuu.keyPath';

export class RestServer {
  #server: Bun.Server<unknown> | undefined;
  #scheme: "http" | "https" = "https";

  constructor(
    private readonly webSocketOptions: VuuWebSocketOptions,
    private readonly httpServerOptions: HttpServerOptions,
  ) {}

  get port() {
    return this.#server?.port;
  }

  get url() {
    const server = this.#server;
    return server
      ? `${this.#scheme}://${server.hostname}:${server.port}`
      : undefined;
  }

  start() {
    if (this.#server) {
      return;
    }
    const { sslOptions } = this.webSocketOptions;
    const {
      authMode,
      requestHandler,
      httpsPort = DEFAULT_REST_HTTPS_PORT,
    } = this.httpServerOptions;
    if (!requestHandler) {
      return;
    }

    const tls = sslEnabled(sslOptions)
      ? {
          cert: Bun.file(sslOptions.certPath),
          key: Bun.file(sslOptions.keyPath),
        }
      : undefined;

    if (!tls) {
      if (authMode?.toLowerCase() !== "permissive") {
        throw new Error(PLAIN_HTTP_REST_REQUIRES_PERMISSIVE_AUTH);
      }
      log.warn(
        "WARNING: REST server (including /api/authn) is running over plain HTTP without TLS (vuu.ssl=false, vuu.auth.mode=permissive). Local development only.",
      );
    }

    this.#scheme = tls ? "https" : "http";
    this.#server = Bun.serve({
      port: httpsPort,
      tls,
      async fetch(req) {
        const url = new URL(req.url);
        const response = await requestHandler(req, url);
        if (response) {
          return response;
        }

        return new Response("Not found", { status: 404 });
      },
    });

    log.info(`REST listening on ${this.url}`);
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
