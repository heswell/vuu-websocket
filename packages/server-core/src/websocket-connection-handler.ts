import { ServerMessagingConfig } from "@heswell/server-types";
import { ServerWebSocket } from "bun";
import {
  clearSession,
  createSession,
  startHeartbeats,
  startMainUpdateLoop,
} from "./sessions";
import { webSocketMessageHandler } from "./websocket-message-handler";

export const websocketConnectionHandler = (config: ServerMessagingConfig) => {
  let stopHeartbeats: undefined | (() => void);
  let stopMainLoop: undefined | (() => void);

  return {
    // compression: config.compression,
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 10,
    open: (ws: ServerWebSocket<{ authToken: string }>) => {
      const sessionCount = createSession(ws);
      if (sessionCount === 1) {
        stopMainLoop = startMainUpdateLoop(config.CLIENT_UPDATE_FREQUENCY);
        stopHeartbeats = startHeartbeats(config.HEARTBEAT_FREQUENCY);
      }
    },
    message: webSocketMessageHandler,
    drain: (ws: ServerWebSocket<{ authToken: string }>) => {
      console.log("WebSocket backpressure: ");
    },
    close: (ws: ServerWebSocket<{ authToken: string }>) => {
      const sessionCount = clearSession(ws);
      if (sessionCount === 0) {
        stopHeartbeats?.();
        stopMainLoop?.();
      }
    },
  };
};
