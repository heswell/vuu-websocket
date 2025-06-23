import {
  WebSocketConnectionHandler,
  WebsocketData,
} from "@heswell/service-utils";
import { uuid } from "@vuu-ui/vuu-utils";
import logger from "./logger";
import { startNewOrderCreation, stopNewOrderCreation } from "./order-factory";
import orderStore from "./OrderStore";

export async function start() {
  console.log(`[ORDERS:service:server] start`);
  const websocketServer = Bun.serve<WebsocketData>({
    // certFile: "./certs/myCA.pem",
    // keyFile: "./certs/myCA.key",
    // passphrase: "1234",

    port: process.env.ORDERS_URL,

    fetch(req, server) {
      const sessionId = uuid();
      logger.info({ sessionId }, "create session");
      const url = new URL(req.url);
      const success = server.upgrade(req, { data: { sessionId } });
      if (success) {
        // Bun automatically returns a 101 Switching Protocols
        // if the upgrade succeeds
        return undefined;
      }

      switch (url.pathname) {
        case "/admin/start": {
          const responseInit: ResponseInit = {
            headers: {
              "Access-Control-Allow-Origin": "*",
            },
          };

          const newOrdersPerSecond = parseInt(
            url.searchParams.get("newOrdersPerSecond") ?? "1"
          );

          startNewOrderCreation({ newOrdersPerSecond });
          return new Response("ok", responseInit);
        }
        case "/admin/stop":
          const responseInit: ResponseInit = {
            headers: {
              "Access-Control-Allow-Origin": "*",
            },
          };
          stopNewOrderCreation();
          return new Response("ok", responseInit);
        default:
          console.log(`unknown url path ${url.pathname}`);
          // handle HTTP request normally
          return new Response("Hello world!");
      }
    },
    websocket: new WebSocketConnectionHandler(orderStore, "ORDERS:service"),
  });

  console.log(
    `[ORDERS:service:server] websocket listening on ${websocketServer.hostname}:${websocketServer.port}`
  );
}
