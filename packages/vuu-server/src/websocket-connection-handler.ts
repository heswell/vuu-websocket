import { ServerMessagingConfig } from "./server-types";
import { ServerWebSocket } from "bun";
import { heapStats } from "bun:jsc";
import {
  clearSession,
  createSession,
  getSession,
  startHeartbeats,
  startMainUpdateLoop,
} from "./net/sessions";
import { webSocketMessageHandler } from "./websocket-message-handler";
import { WebsocketData } from "./server";
import { messageAPI } from "./VuuProtocolHandler";

export const websocketConnectionHandler = (config: ServerMessagingConfig) => {
  let stopHeartbeats: undefined | (() => void);
  let stopMainLoop: undefined | (() => void);

  return {
    // compression: config.compression,
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 10,
    open: (ws: ServerWebSocket<WebsocketData>) => {
      console.log(`new WebSocket, open a new Session = ${ws.data.sessionId}`);
      const sessionCount = createSession(ws.data.sessionId, ws);
      if (sessionCount === 1) {
        stopMainLoop = startMainUpdateLoop(config.CLIENT_UPDATE_FREQUENCY);
        stopHeartbeats = startHeartbeats(config.HEARTBEAT_FREQUENCY);
      }

      const { objectCount } = heapStats();
      console.log(` =====>  object count ${objectCount.toLocaleString()}`);
    },
    message: webSocketMessageHandler,
    drain: (ws: ServerWebSocket) => {
      console.log("WebSocket backpressure: ");
    },
    close: (ws: ServerWebSocket<WebsocketData>) => {
      console.log(`WebSocket closed`);
      const session = getSession(ws.data.sessionId);
      if (session) {
        const teardownHandler = messageAPI.onSessionClosed;
        if (teardownHandler) {
          teardownHandler?.({}, session);
        }
        const sessionCount = clearSession(ws.data.sessionId);
        if (sessionCount === 0) {
          stopHeartbeats?.();
          stopMainLoop?.();
        }
      } else {
        throw Error(`websocket connection lost, no session found`);
      }
    },
  };
};
