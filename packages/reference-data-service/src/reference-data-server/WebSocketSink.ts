import { ServerWebSocket } from "bun";
import { WebsocketData } from "./reference-data-server";
import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import logger from "../logger";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(() => resolve(undefined), ms));

export class WebSocketSink<D = WebsocketData, MSG = VuuDataRow> {
  static #messageCount = 0;
  /**
   * messageCount is reset to zero each time property is read
   */
  static get messageCount() {
    const count = this.#messageCount;
    this.#messageCount = 0;
    return count;
  }
  constructor(private sessionId: string, private ws: ServerWebSocket<D>) {}
  start() {
    logger.info({ sessionId: this.sessionId }, "[WebSocketSink] start");
  }
  write(message: MSG) {
    WebSocketSink.#messageCount += 1;
    logger.trace({ sessionId: this.sessionId, instrument: message });
    this.ws.send(JSON.stringify(message));
    return sleep(0);
  }
  close() {
    logger.info({ sessionId: this.sessionId }, "[WebSocketSink] close");
  }
}
