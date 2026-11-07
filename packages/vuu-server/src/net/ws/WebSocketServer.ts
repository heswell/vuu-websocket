import { sslEnabled, VuuWebSocketOptions } from "../../core/VuuServerOptions";
import { type ViewServerHandlerFactory } from "../ViewServerHandler";
import { getLogger } from "@heswell/service-utils/browser";
import type { RunningServer, ServerRuntime } from "../../runtime/ServerRuntime";

const log = getLogger("vuu.net");

const MAX_PAYLOAD_LENGTH = 16 * 1024 * 1024;
const IDLE_TIMEOUT_SECONDS = 10;

export class WebSocketServer {
  #server: RunningServer | undefined;

  constructor(
    private readonly webSocketOptions: VuuWebSocketOptions,
    private readonly factory: ViewServerHandlerFactory,
    private readonly runtime: () => Promise<ServerRuntime>,
  ) {}

  get port() {
    return this.#server?.port;
  }

  async start() {
    if (this.#server) {
      return;
    }
    const { sslOptions, uri, wsPort } = this.webSocketOptions;
    const handler = this.factory.create();
    const runtime = await this.runtime();
    this.#server = await runtime.serveWebSocket({
      port: wsPort,
      path: uri,
      tls: sslEnabled(sslOptions) ? sslOptions : undefined,
      maxPayloadLength: MAX_PAYLOAD_LENGTH,
      idleTimeoutSeconds: IDLE_TIMEOUT_SECONDS,
      createData: () => {
        const sessionId = crypto.randomUUID();
        log.debug(`websocket upgrade request sessionId ${sessionId}`);
        return { sessionId };
      },
      open: (channel) => {
        log.debug(`new websocket connection ${channel.data.sessionId}`);
      },
      message: async (channel, message) => {
        try {
          await handler.handle(message, channel);
        } catch (error) {
          // last resort, handle() is not expected to reject
          log.error(
            `unhandled error processing message on channel ${channel.data.sessionId}`,
            error,
          );
        }
      },
      close: (channel, code, reason) => {
        log.debug(
          `WebSocket closed ${channel.data.sessionId} (${code} ${reason})`,
        );
        try {
          handler.close(channel);
        } catch (error) {
          log.error(
            `failed to clean up sessions of channel ${channel.data.sessionId}`,
            error,
          );
        }
      },
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
    await server.stop();
  }
}
