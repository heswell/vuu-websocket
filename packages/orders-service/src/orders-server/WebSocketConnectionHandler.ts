import { ServerWebSocket, WebSocketHandler } from "bun";
import { WebsocketData } from "./server";
import { WebSocketSink } from "./WebSocketSink";
import { ArrayDataStreamSource } from "./ArrayDataStreamSource";
import OrderStore from "./OrderStore";
import {
  clearSession,
  createSession,
  getSession,
  startHeartbeats,
  startMainUpdateLoop,
} from "./sessions";

import logger from "../logger";

export interface OrdersServiceSubscribeMessage {
  tableName: "parentOrders" | "childOrders" | "all";
  type: "subscribe";
}

interface OrderMessage {
  type: "subscribe" | "cancel";
}

export class WebSocketConnectionHandler
  implements WebSocketHandler<WebsocketData>
{
  #stopHeartbeats: undefined | (() => void);
  #stopMainLoop: undefined | (() => void);

  open = (ws: ServerWebSocket<WebsocketData>) => {
    logger.info(
      `[ORDERS:service:WebSocketConnectionHandler] new WebSocket, open a new Session = ${ws.data.sessionId}`
    );

    const sessionCount = createSession(ws.data.sessionId, ws);
    if (sessionCount === 1) {
      this.#stopMainLoop = startMainUpdateLoop(100);
      this.#stopHeartbeats = startHeartbeats(180_000);
    }
  };

  message = async (
    ws: ServerWebSocket<WebsocketData>,
    message: string | Buffer
  ) => {
    const { type } = JSON.parse(message as string) as OrderMessage;
    console.log(
      `[ORDERS:service:WebsocketConnectionHandler] message IN '${type}' sessionId #${ws.data.sessionId}`
    );
    const { id: sessionId, stream } = getSession(ws.data.sessionId, true);

    switch (type) {
      case "subscribe":
        {
          `[ORDERS:service:WebsocketConnectionHandler] request received for parentOrders`;
          const readStream = new ReadableStream(
            new ArrayDataStreamSource(sessionId, OrderStore.parentOrders, {
              type: "bulk-insert",
              tableName: "parentOrders",
            })
          );
          readStream.pipeTo(stream);
        }

        break;

      default:
        logger.warn(
          `[ORDERS:service:WebsocketConnectionHandler] unknown message type ${type}`
        );
    }
  };

  drain = (ws: ServerWebSocket<WebsocketData>) => {
    logger.warn(
      "[ORDERS:service:WebsocketConnectionHandler] WebSocket backpressure: "
    );
  };

  close = (ws: ServerWebSocket<WebsocketData>) => {
    console.log(
      `[ORDERS:service:WebsocketConnectionHandler] connection closed, terminate session ${ws.data.sessionId}`
    );
    const session = getSession(ws.data.sessionId);
    if (session) {
      const sessionCount = clearSession(ws.data.sessionId);
      if (sessionCount === 0) {
        this.#stopHeartbeats?.();
        this.#stopMainLoop?.();
      }
    } else {
      throw Error(
        `[ORDERS:service:WebsocketConnectionHandler] websocket connection lost, no session found`
      );
    }
  };
}

setInterval(() => {
  const count = WebSocketSink.messageCount;
  if (count > 0) {
    console.log(`${count} messages`);
  }
}, 1000);
