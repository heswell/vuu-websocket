import { ServerWebSocket, WebSocketHandler } from "bun";
import { WebsocketData } from "./server";
import { WebSocketSink } from "./WebSocketSink";
import { parentOrders, childOrders, fills } from "./ParentOrdersStore";
import { ArrayDataStreamSource } from "./ArrayDataStreamSource";
import logger from "../logger";

type ISession = {
  id: string;
  wsStream: WritableStream;
};

export class WebSocketConnectionHandler
  implements WebSocketHandler<WebsocketData>
{
  #sessions = new Map<string, ISession>();

  open = (ws: ServerWebSocket<WebsocketData>) => {
    logger.info(
      `[OrderService] new WebSocket, open a new Session = ${ws.data.sessionId}`
    );
    const { sessionId } = ws.data;
    this.#sessions.set(sessionId, {
      id: sessionId,
      wsStream: new WritableStream(new WebSocketSink(sessionId, ws)),
    });
  };

  message = async (
    ws: ServerWebSocket<WebsocketData>,
    message: string | Buffer
  ) => {
    const { type } = JSON.parse(message as string);

    const session = this.#sessions.get(ws.data.sessionId);
    if (session === undefined) {
      throw Error(
        `[WebSocketConnectionHandler] no session found #${ws.data.sessionId}`
      );
    }
    const { id: sessionId, wsStream } = session;

    logger.info({ sessionId, type });

    switch (type) {
      case "parentOrders":
        {
          `[OrdersServer WebSocketConnectionHandler] request received for parentOrders`;
          const readStream = new ReadableStream(
            new ArrayDataStreamSource(sessionId, parentOrders, 50)
          );
          readStream.pipeTo(wsStream);
        }

        break;

      default:
        logger.warn(
          `[WebSocketConnectionHandler] unknown message type ${type}`
        );
    }
  };

  drain = (ws: ServerWebSocket<WebsocketData>) => {
    logger.warn("[OrderService] WebSocket backpressure: ");
  };

  close = (ws: ServerWebSocket<WebsocketData>) => {
    const { sessionId } = ws.data;
    const session = this.#sessions.get(sessionId);
    if (session) {
      this.#sessions.delete(session.id);
      logger.info(
        `[OrderService] WebSocket closed, remove session ${sessionId}`
      );
    } else {
      logger.warn(
        `[OrderService] WebSocket closed, no session ${sessionId} not found`
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
