import { webSocketMessageHandler } from "./websocket-message-handler";
import { uuid } from "./uuid";
import { ServerWebSocket } from "bun";
import { clearSession, createSession, startMainUpdateLoop } from "./sessions";
import { VuuServerConfig } from "./serverTypes";

export const websocketConnectionHandler = (config: VuuServerConfig) => {
  let stopMainLoop = null;

  return {
    // compression: config.compression,
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 10,
    open: (ws: ServerWebSocket<{ authToken: string }>) => {
      const sessionCount = createSession(ws, config);
      if (sessionCount === 1) {
        stopMainLoop = startMainUpdateLoop(config.CLIENT_UPDATE_FREQUENCY);
      }
    },
    message: webSocketMessageHandler(config),
    drain: (ws: ServerWebSocket<{ authToken: string }>) => {
      console.log("WebSocket backpressure: ");
    },
    close: (ws: ServerWebSocket<{ authToken: string }>) => {
      clearSession(ws);
    },
  };
};
