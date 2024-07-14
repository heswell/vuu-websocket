import { ClientToServerMessage } from "@vuu-ui/vuu-protocol-types";
import { ServerWebSocket } from "bun";
import { getSession } from "./sessions";
import { getHandlerForMessage } from "./requestHandlers";

export const webSocketMessageHandler = async (
  ws: ServerWebSocket<{ authToken: string }>,
  message: string | ArrayBuffer | Uint8Array
) => {
  const session = getSession(ws);
  if (session) {
    const vuuMessage = JSON.parse(message as string) as ClientToServerMessage;
    const { requestId } = vuuMessage;
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
