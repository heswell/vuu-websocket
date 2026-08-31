import { sslEnabled, VuuWebSocketOptions } from "../../core/VuuServerOptions";
import { type ViewServerHandlerFactory } from "../ViewServerHandler";
import { BunWebSocketConnectionHandler } from "./BunWebSocketConnectionHandler";

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
        console.log(
          `[VUU:server] websocket upgrade request sessionId ${sessionId}`,
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

    console.log(
      `[VUU] WebSocket listening on ${this.#server.hostname}:${this.#server.port}${uri}`,
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
