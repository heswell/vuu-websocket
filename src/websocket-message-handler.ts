import { ServerWebSocket } from "bun";
import { getSession } from "./sessions";

export const webSocketMessageHandler =
  (config: any) =>
  async (
    ws: ServerWebSocket<{ authToken: string }>,
    message: string | ArrayBuffer | Uint8Array
  ) => {
    const session = getSession(ws);
    if (session) {
      const {
        requestId,
        module,
        body: { type: messageType, ...messageBody },
      } = JSON.parse(message as string);
      switch (messageType) {
        case "LOGIN":
          return session.login(requestId, messageBody);
        default:
          console.log(`unknown message type ${messageType}`);
      }
    } else {
      console.error(`no session found`);
    }
  };
