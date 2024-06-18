import { ServerConfig, ServerMessagingConfig } from "@heswell/server-types";
import { websocketConnectionHandler } from "./websocket-connection-handler";
import { configureRequestHandlers } from "./requestHandlers";

const PRIORITY_UPDATE_FREQUENCY = 20;
const CLIENT_UPDATE_FREQUENCY = 50;
const HEARTBEAT_FREQUENCY = 5000;

const msgConfig: ServerMessagingConfig = {
  CLIENT_UPDATE_FREQUENCY,
  HEARTBEAT_FREQUENCY,
  PRIORITY_UPDATE_FREQUENCY,
};

export function start(config: ServerConfig) {
  configureRequestHandlers({
    ...config,
  });

  const server = Bun.serve<{ authToken: string }>({
    // certFile: "./certs/myCA.pem",
    // keyFile: "./certs/myCA.key",
    // passphrase: "1234",
    port: 8090,

    fetch(req, server) {
      const success = server.upgrade(req);
      if (success) {
        // Bun automatically returns a 101 Switching Protocols
        // if the upgrade succeeds
        return undefined;
      }

      // handle HTTP request normally
      return new Response("Hello world!");
    },
    websocket: websocketConnectionHandler(msgConfig),
  });

  console.log(`Listening on ${server.hostname}:${server.port}`);
}
