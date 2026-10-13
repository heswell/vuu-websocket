import type { ServerWebSocket } from "bun";
import { ViewServerHandler } from "../ViewServerHandler";
import { getLogger, type WebsocketData } from "@heswell/service-utils";
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
      await viewserverHandler.handle(msg as string, ws);
    },
    drain: (ws: ServerWebSocket) => {
      log.debug("WebSocket backpressure (drain)");
    },
    close: (ws: ServerWebSocket<WebsocketData>) => {
      log.debug(`WebSocket closed ${ws.data.sessionId}`);
    },
  };
};
