import {
  DataTableAPI,
  ServerConfig,
  ServerMessagingConfig,
} from "@heswell/server-types";
import { websocketConnectionHandler } from "./websocket-connection-handler";
import { configureRequestHandlers, getRestHandler } from "./requestHandlers";

const PRIORITY_UPDATE_FREQUENCY = 20;
const CLIENT_UPDATE_FREQUENCY = 50;
const HEARTBEAT_FREQUENCY = 5000;

const msgConfig: ServerMessagingConfig = {
  CLIENT_UPDATE_FREQUENCY,
  HEARTBEAT_FREQUENCY,
  PRIORITY_UPDATE_FREQUENCY,
};

export async function start(...configs: ServerConfig[]) {
  let tableService: DataTableAPI | undefined = undefined;
  for (const config of configs) {
    const result = await configureRequestHandlers(config, tableService);
    tableService ??= result;
  }

  const restServer = Bun.serve<{ authToken: string }>({
    // certFile: "./certs/myCA.pem",
    // keyFile: "./certs/myCA.key",
    // passphrase: "1234",
    port: 8081,

    fetch(req) {
      const restHandler = getRestHandler("restHandler");
      const url = new URL(req.url);
      if (url.pathname === "/") return new Response("Home page");
      if (url.pathname.startsWith("/api")) return restHandler(req);
      return new Response("404");
    },
  });

  const websocketServer = Bun.serve<{ authToken: string }>({
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

  console.log(
    `REST server listening on ${restServer.hostname}:${restServer.port}`
  );
  console.log(
    `Websocket listening on ${websocketServer.hostname}:${websocketServer.port}`
  );
}
