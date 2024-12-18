import { VuuClientMessage } from "@vuu-ui/vuu-protocol-types";
import { ServerWebSocket } from "bun";
import { getSession } from "./sessions";
import { getHandlerForMessage } from "./requestHandlers";
import { WebsocketData } from "./server";

export const webSocketMessageHandler = async (
  ws: ServerWebSocket<WebsocketData>,
  message: string | Buffer
) => {
  // console.log(`=====> ${message}`);
  const session = getSession(ws.data.sessionId);
  // console.log(`session id = ${session?.id}`);
  if (session) {
    const vuuMessage = JSON.parse(message as string) as VuuClientMessage;
    const { requestId } = vuuMessage;
    // console.log(`===> [${vuuMessage.body.type}]`);
    if (vuuMessage.body.type === "LOGIN") {
      return session.login(requestId, vuuMessage.body);
    } else if (vuuMessage.body.type === "HB_RESP") {
      session.incomingHeartbeat = vuuMessage.body.ts;
    } else {
      const handler = getHandlerForMessage(vuuMessage.body.type);
      if (handler) {
        handler(vuuMessage, session);
      } else {
        console.log(`unknown message type ${vuuMessage.body.type}`);
      }
    }
  } else {
    console.error(`no session found`);
  }
};
