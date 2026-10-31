import { sslEnabled, VuuWebSocketOptions } from "../../core/VuuServerOptions";
import { type ViewServerHandlerFactory } from "../ViewServerHandler";
import { BunWebSocketConnectionHandler } from "./BunWebSocketConnectionHandler";
import { getLogger } from "@heswell/service-utils/browser";

const log = getLogger("vuu.net");
const STOP_TIMEOUT_MS = 250;

export class WebSocketServer {
  #server: Bun.Server<unknown> | undefined;

  constructor(
    private readonly webSocketOptions: VuuWebSocketOptions,
    private readonly factory: ViewServerHandlerFactory,
  ) {}

  get port() {
    return this.#server?.port;
  }

  start() {
    if (this.#server) {
      return;
    }
    const { sslOptions, uri, wsPort, ...options } = this.webSocketOptions;
    this.#server = Bun.serve({
      port: wsPort,
      tls: sslEnabled(sslOptions)
        ? {
            cert: Bun.file(sslOptions.certPath),
            key: Bun.file(sslOptions.keyPath),
          }
        : undefined,

      async fetch(req, server) {
        if (new URL(req.url).pathname !== uri) {
          return new Response("Not found", { status: 404 });
        }
        const sessionId = crypto.randomUUID();
        log.debug(
          `websocket upgrade request sessionId ${sessionId}`,
        );
        const success = server.upgrade(req, { data: { sessionId } });
        if (success) {
          // Bun automatically returns a 101 Switching Protocols
          // if the upgrade succeeds
          return undefined;
        }
        return new Response("Not found", { status: 404 });
      },
      websocket: BunWebSocketConnectionHandler(
        { ...options, uri },
        this.factory.create(),
      ),
    });

    log.info(
      `WebSocket listening on ${sslEnabled(sslOptions) ? "wss" : "ws"}://${this.#server.hostname}:${this.#server.port}${uri}`,
    );
  }

  async stop() {
    const server = this.#server;
    if (!server) {
      return;
    }
    this.#server = undefined;
    // Bun (1.3.x) never settles the forced stop promise once the server has
    // closed a websocket itself (eviction, invalid session, login failure),
    // although the listener and all connections are closed. Don't wait for
    // it indefinitely.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopped = await Promise.race([
      server.stop(true).then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), STOP_TIMEOUT_MS);
      }),
    ]);
    clearTimeout(timer);
    if (!stopped) {
      log.debug(
        `WebSocket server stop did not settle within ${STOP_TIMEOUT_MS}ms, continuing`,
      );
    }
  }
}
