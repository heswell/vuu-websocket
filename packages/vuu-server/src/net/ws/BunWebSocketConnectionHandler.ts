import { ServerWebSocket } from "bun";
import { ViewServerHandler } from "../ViewServerHandler";
import { WebsocketData } from "@heswell/service-utils";
import { VuuWebSocketOptions } from "../../core/VuuServerOptions";

export const BunWebSocketConnectionHandler = (
  _vuuWebSocketOptions: Omit<VuuWebSocketOptions,"sslOptions" | "wsPort">,
  viewserverHandler: ViewServerHandler,
) => {

  return {
    // compression: config.compression,
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 10,
    open: (ws: ServerWebSocket<WebsocketData>) => {
      console.log(
        `[BunWebSocketConnectionHandler] new connection  ${ws.data.sessionId}`,
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
      console.log("WebSocket backpressure: ");
    },
    close: (ws: ServerWebSocket<WebsocketData>) => {
      console.log(`WebSocket closed`);
    },
  };
};
