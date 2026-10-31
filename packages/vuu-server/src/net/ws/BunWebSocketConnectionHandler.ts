import type { ServerWebSocket } from "bun";
import { ViewServerHandler } from "../ViewServerHandler";
import { getLogger, type WebsocketData } from "@heswell/service-utils/browser";
import { VuuWebSocketOptions } from "../../core/VuuServerOptions";

const log = getLogger("vuu.net");

export const BunWebSocketConnectionHandler = (
  _vuuWebSocketOptions: Omit<VuuWebSocketOptions,"sslOptions" | "wsPort">,
  viewserverHandler: ViewServerHandler,
) => {

  return {
    // compression: config.compression,
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 10,
    open: (ws: ServerWebSocket<WebsocketData>) => {
      log.debug(
        `new websocket connection ${ws.data.sessionId}`,
      );
    },
    message: async (
      ws: ServerWebSocket<WebsocketData>,
      msg: string | Buffer,
    ) => {
      // Added by Copilot for issue #10: await async RPC/service handling completion.
      try {
        await viewserverHandler.handle(String(msg), ws);
      } catch (error) {
        // last resort, handle() is not expected to reject
        log.error(
          `unhandled error processing message on channel ${ws.data.sessionId}`,
          error,
        );
      }
    },
    drain: (ws: ServerWebSocket) => {
      log.debug("WebSocket backpressure (drain)");
    },
    close: (
      ws: ServerWebSocket<WebsocketData>,
      code: number,
      reason: string,
    ) => {
      log.debug(`WebSocket closed ${ws.data.sessionId} (${code} ${reason})`);
      try {
        viewserverHandler.close(ws);
      } catch (error) {
        log.error(
          `failed to clean up sessions of channel ${ws.data.sessionId}`,
          error,
        );
      }
    },
  };
};
