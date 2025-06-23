import {
  ArrayDataStreamSource,
  IDequeue,
  ResourceMessage,
  SessionContainer,
  WebSocketSink,
  type WebsocketData,
} from "@heswell/service-utils";
import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import { ServerWebSocket, WebSocketHandler } from "bun";
import logger from "./logger";

export interface IDataStore {
  getSnapshot: (resourceName: string) => VuuDataRow[];
}

interface ClientMessage {
  resource: string;
  type: "subscribe" | "cancel";
}

export class WebSocketConnectionHandler
  implements WebSocketHandler<WebsocketData>
{
  #sessionContainer: SessionContainer;

  constructor(
    private store: IDataStore & IDequeue<ResourceMessage>,
    private loggingContext = "service-utils"
  ) {
    this.#sessionContainer = new SessionContainer(store, loggingContext);
  }

  open = (ws: ServerWebSocket<WebsocketData>) => {
    logger.info(
      `[${this.loggingContext}:WebSocketConnectionHandler] new WebSocket, open a new Session = ${ws.data.sessionId}`
    );

    this.#sessionContainer.createSession(ws.data.sessionId, ws);
  };

  message = async (
    ws: ServerWebSocket<WebsocketData>,
    message: string | Buffer
  ) => {
    const { type, resource } = JSON.parse(message as string) as ClientMessage;
    console.log(
      `[${this.loggingContext}:WebsocketConnectionHandler] message IN '${type}' ${resource} sessionId #${ws.data.sessionId}`
    );
    const session = this.#sessionContainer.getSession(ws.data.sessionId, true);

    switch (type) {
      case "subscribe":
        {
          // TODO what if we're still streaming the snapshot when updates are processed
          `[${this.loggingContext}:WebsocketConnectionHandler] subscribe request received for parentOrders`;
          const readStream = new ReadableStream(
            new ArrayDataStreamSource(
              this.store.getSnapshot(resource),
              this.loggingContext
            )
          );
          readStream.pipeTo(session.stream);
        }

        break;

      default:
        logger.warn(
          `[${this.loggingContext}:WebsocketConnectionHandler] unknown message type ${type}`
        );
    }
  };

  drain = (ws: ServerWebSocket<WebsocketData>) => {
    logger.warn(
      "[${this.loggingContext}:WebsocketConnectionHandler] WebSocket backpressure: "
    );
  };

  close = (ws: ServerWebSocket<WebsocketData>) => {
    console.log(
      `[${this.loggingContext}:WebsocketConnectionHandler] connection closed, terminate session ${ws.data.sessionId}`
    );
    const session = this.#sessionContainer.getSession(ws.data.sessionId);
    if (session) {
      this.#sessionContainer.clearSession(ws.data.sessionId);
    } else {
      throw Error(
        `[${this.loggingContext}:WebsocketConnectionHandler] websocket connection lost, no session found`
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
