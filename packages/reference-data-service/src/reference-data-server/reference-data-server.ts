import { uuid } from "@vuu-ui/vuu-utils";
import { WebSocketConnectionHandler } from "./WebSocketConnectionHandler";
import "./InstrumentStore";
import logger from "../logger";

export interface WebsocketData {
  sessionId: string;
}

const websocketServer = Bun.serve<WebsocketData>({
  // certFile: "./certs/myCA.pem",
  // keyFile: "./certs/myCA.key",
  // passphrase: "1234",

  port: 8091,

  fetch(req, server) {
    const sessionId = uuid();
    logger.info({ sessionId }, "create session");
    const success = server.upgrade(req, { data: { sessionId } });
    if (success) {
      // Bun automatically returns a 101 Switching Protocols
      // if the upgrade succeeds
      return undefined;
    }

    // handle HTTP request normally
    return new Response("Hello world!");
  },
  websocket: new WebSocketConnectionHandler(),
});

console.log(
  `[ReferenceDataService] websocket listening on ${websocketServer.hostname}:${websocketServer.port}`
);
