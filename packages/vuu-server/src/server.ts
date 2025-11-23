import { VuuServer } from "./core/VuuServer";
import { ServerMessagingConfig } from "./server-types";
import { websocketConnectionHandler } from "./websocket-connection-handler";
import { uuid } from "@vuu-ui/vuu-utils";
import path from "path";

const PRIORITY_UPDATE_FREQUENCY = 20;
const CLIENT_UPDATE_FREQUENCY = 120;
const HEARTBEAT_FREQUENCY = 6000;

const msgConfig: ServerMessagingConfig = {
  CLIENT_UPDATE_FREQUENCY,
  HEARTBEAT_FREQUENCY,
  PRIORITY_UPDATE_FREQUENCY,
};

const WS_PORT = process.env.WEBSOCKET_PORT ?? 8090;

export interface WebsocketData {
  sessionId: string;
}

export default async function start(vuuServer: VuuServer) {
  const certsPath = path.join(import.meta.dir, "../certs");

  const websocketServer = Bun.serve({
    certFile: `${certsPath}/cert.pem`,
    keyFile: `${certsPath}/key.pem`,
    port: WS_PORT,

    fetch(req, server) {
      const sessionId = uuid();
      console.log(
        `[VUU:server] websocket upgrade request sessionId ${sessionId}`
      );
      const success = server.upgrade(req, { data: { sessionId } });
      if (success) {
        // Bun automatically returns a 101 Switching Protocols
        // if the upgrade succeeds
        return undefined;
      }

      // handle HTTP request normally
      const url = new URL(req.url);
      if (url.pathname === "/api/authn") {
        console.log("auth request");
        const vuuUser = {
          name: "steve",
          authorizations: [],
        };
        const token = `${btoa(JSON.stringify(vuuUser))}.${uuid()}`;

        const responseInit: ResponseInit = {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "vuu-auth-token": token,
          },
        };
        return new Response("ok", responseInit);
      } else {
        return new Response("Hello world!");
      }
    },
    websocket: websocketConnectionHandler(msgConfig, vuuServer),
  });

  console.log(
    `[VUU] Websocket listening on ${websocketServer.hostname}:${websocketServer.port}`
  );
}
