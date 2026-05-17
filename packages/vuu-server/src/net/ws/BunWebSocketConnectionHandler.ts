// import { ServerMessagingConfig } from "./server-types";
import { ServerWebSocket } from "bun";
// import {
//   clearSession,
//   createSession,
//   getSession,
//   startHeartbeats,
//   startMainUpdateLoop,
// } from "./net/sessions";
// import type { WebsocketData } from "./server";
// import { messageAPI } from "./VuuProtocolHandler";
// import { VuuServer } from "./core/VuuServer";
// import {
//   VuuClientMessage,
//   VuuLoginSuccessResponse,
// } from "@vuu-ui/vuu-protocol-types";
// import loginTokenService from "./net/LoginTokenService";
import { ViewServerHandler } from "../ViewServerHandler";
import { WebsocketData } from "@heswell/service-utils";
import { ServerMessagingConfig } from "../../server-types";

export const BunWebSocketConnectionHandler = (
  _config: ServerMessagingConfig,
  viewserverHandler: ViewServerHandler,
) => {
  let stopHeartbeats: undefined | (() => void);
  let stopMainLoop: undefined | (() => void);

  return {
    // compression: config.compression,
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 10,
    open: (ws: ServerWebSocket<WebsocketData>) => {
      console.log(
        `[BunWebSocketConnectionHandler] new connection  ${ws.data.sessionId}`,
      );
      // const sessionCount = createSession(ws.data.sessionId, ws);
      // if (sessionCount === 1) {
      //   stopMainLoop = startMainUpdateLoop(config.CLIENT_UPDATE_FREQUENCY);
      //   stopHeartbeats = startHeartbeats(config.HEARTBEAT_FREQUENCY);
      // }
    },
    message: async (
      ws: ServerWebSocket<WebsocketData>,
      msg: string | Buffer,
    ) => {
      viewserverHandler.handle(msg as string, ws);
      // const session = getSession(ws.data.sessionId);
      // if (session) {
      //   const vuuMessage = JSON.parse(msg as string) as VuuClientMessage;
      //   const { requestId } = vuuMessage;
      //   if (vuuMessage.body.type === "LOGIN") {
      //     const loginResult = loginTokenService.login(vuuMessage.body);
      //     if (typeof loginResult === "string") {
      //       session.enqueue(requestId, loginResult);
      //       // TODO clear the session
      //     } else {
      //       // TODO we should create the session here
      //       session.authenticated = true;
      //       session.enqueue(requestId, {
      //         type: "LOGIN_SUCCESS",
      //         vuuServerId: "server1",
      //       } as VuuLoginSuccessResponse);
      //     }
      //   } else if (vuuMessage.body.type === "HB_RESP") {
      //     session.incomingHeartbeat = vuuMessage.body.ts;
      //   } else {
      //     vuuServer.serverApi.process(vuuMessage, session);
      //   }
      // } else {
      //   console.error(`no session found`);
      // }
    },
    drain: (ws: ServerWebSocket) => {
      console.log("WebSocket backpressure: ");
    },
    close: (ws: ServerWebSocket<WebsocketData>) => {
      console.log(`WebSocket closed`);
      // const session = getSession(ws.data.sessionId);
      // if (session) {
      //   // const teardownHandler = messageAPI.onSessionClosed;
      //   // if (teardownHandler) {
      //   //   teardownHandler?.({}, session);
      //   // }
      //   vuuServer.viewPortContainer.removeViewportsForSession(
      //     ws.data.sessionId,
      //   );
      //   const sessionCount = clearSession(ws.data.sessionId);
      //   if (sessionCount === 0) {
      //     stopHeartbeats?.();
      //     stopMainLoop?.();
      //   }
      // } else {
      //   throw Error(`websocket connection lost, no session found`);
      // }
    },
  };
};
