import { VuuServer } from "./core/VuuServer";
import { ServerMessagingConfig } from "./server-types";
import { websocketConnectionHandler } from "./websocket-connection-handler";
import { uuid } from "@vuu-ui/vuu-utils";

const PRIORITY_UPDATE_FREQUENCY = 20;
const CLIENT_UPDATE_FREQUENCY = 120;
const HEARTBEAT_FREQUENCY = 6000;

const msgConfig: ServerMessagingConfig = {
  CLIENT_UPDATE_FREQUENCY,
  HEARTBEAT_FREQUENCY,
  PRIORITY_UPDATE_FREQUENCY,
};

const WS_PORT = process.env.WEBSOCKET_PORT ?? 9090;

export interface WebsocketData {
  sessionId: string;
}

export default async function start(vuuServer: VuuServer) {
  const websocketServer = Bun.serve({
    // certFile: "./certs/myCA.pem",
    // keyFile: "./certs/myCA.key",
    // passphrase: "1234",
    port: WS_PORT,

    fetch(req, server) {
      const sessionId = uuid();
      console.log(`websocket upgrade request sessionId ${sessionId}`);
      const success = server.upgrade(req, { data: { sessionId } });
      if (success) {
        // Bun automatically returns a 101 Switching Protocols
        // if the upgrade succeeds
        return undefined;
      }

      // handle HTTP request normally
      return new Response("Hello world!");
    },
    websocket: websocketConnectionHandler(msgConfig, vuuServer),
  });

  console.log(
    `Websocket listening on ${websocketServer.hostname}:${websocketServer.port}`
  );
}
