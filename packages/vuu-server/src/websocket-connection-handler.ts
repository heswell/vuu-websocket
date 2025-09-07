import { ServerMessagingConfig } from "./server-types";
import { ServerWebSocket } from "bun";
import {
  clearSession,
  createSession,
  getSession,
  startHeartbeats,
  startMainUpdateLoop,
} from "./net/sessions";
import type { WebsocketData } from "./server";
// import { messageAPI } from "./VuuProtocolHandler";
import { VuuServer } from "./core/VuuServer";
import { VuuClientMessage } from "@vuu-ui/vuu-protocol-types";

export const websocketConnectionHandler = (
  config: ServerMessagingConfig,
  vuuServer: VuuServer
) => {
  let stopHeartbeats: undefined | (() => void);
  let stopMainLoop: undefined | (() => void);

  return {
    // compression: config.compression,
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 10,
    open: (ws: ServerWebSocket<WebsocketData>) => {
      console.log(
        `[VUU:server:websocket-connection-handler] new WebSocket, open a new Session = ${ws.data.sessionId}`
      );
      const sessionCount = createSession(ws.data.sessionId, ws);
      if (sessionCount === 1) {
        stopMainLoop = startMainUpdateLoop(config.CLIENT_UPDATE_FREQUENCY);
        stopHeartbeats = startHeartbeats(config.HEARTBEAT_FREQUENCY);
      }
    },
    message: async (
      ws: ServerWebSocket<WebsocketData>,
      msg: string | Buffer
    ) => {
      const session = getSession(ws.data.sessionId);
      if (session) {
        const vuuMessage = JSON.parse(msg as string) as VuuClientMessage;
        const { requestId } = vuuMessage;
        if (vuuMessage.body.type === "LOGIN") {
          return session.login(requestId, vuuMessage.body);
        } else if (vuuMessage.body.type === "HB_RESP") {
          session.incomingHeartbeat = vuuMessage.body.ts;
        } else {
          vuuServer.serverApi.process(vuuMessage, session);
        }
      } else {
        console.error(`no session found`);
      }
    },
    drain: (ws: ServerWebSocket) => {
      console.log("WebSocket backpressure: ");
    },
    close: (ws: ServerWebSocket<WebsocketData>) => {
      console.log(`WebSocket closed`);
      const session = getSession(ws.data.sessionId);
      if (session) {
        // const teardownHandler = messageAPI.onSessionClosed;
        // if (teardownHandler) {
        //   teardownHandler?.({}, session);
        // }
        vuuServer.viewPortContainer.removeViewportsForSession(
          ws.data.sessionId
        );
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
