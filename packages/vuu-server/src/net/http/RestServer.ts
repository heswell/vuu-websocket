import {
  HttpServerOptions,
  sslEnabled,
  VuuWebSocketOptions,
} from "../../core/VuuServerOptions";
import { getLogger } from "@heswell/service-utils/browser";
import type { RunningServer, ServerRuntime } from "../../runtime/ServerRuntime";

const log = getLogger("vuu.net");

const DEFAULT_REST_HTTPS_PORT = 8443;

export const PLAIN_HTTP_REST_REQUIRES_PERMISSIVE_AUTH =
  'REST auth over plain HTTP is only allowed with vuu.auth.mode="permissive"; set vuu.ssl=true with vuu.certPath/vuu.keyPath';

export class RestServer {
  #server: RunningServer | undefined;
  #scheme: "http" | "https" = "https";

  constructor(
    private readonly webSocketOptions: VuuWebSocketOptions,
    private readonly httpServerOptions: HttpServerOptions,
    private readonly runtime: () => Promise<ServerRuntime>,
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

  async start() {
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

    const tls = sslEnabled(sslOptions) ? sslOptions : undefined;

    if (!tls) {
      if (authMode?.toLowerCase() !== "permissive") {
        throw new Error(PLAIN_HTTP_REST_REQUIRES_PERMISSIVE_AUTH);
      }
      log.warn(
        "WARNING: REST server (including /api/authn) is running over plain HTTP without TLS (vuu.ssl=false, vuu.auth.mode=permissive). Local development only.",
      );
    }

    this.#scheme = tls ? "https" : "http";
    const runtime = await this.runtime();
    this.#server = await runtime.serveHttp({
      port: httpsPort,
      tls,
      fetch: (req) => requestHandler(req, new URL(req.url)),
    });

    log.info(`REST listening on ${this.url}`);
  }

  async stop() {
    const server = this.#server;
    if (!server) {
      return;
    }
    this.#server = undefined;
    await server.stop();
  }
}
