import { uuid } from "@vuu-ui/vuu-utils";
import { sslEnabled, VuuWebSocketOptions } from "../../core/VuuServerOptions";
import { type ViewServerHandlerFactory } from "../ViewServerHandler";
import { BunWebSocketConnectionHandler } from "./BunWebSocketConnectionHandler";

export class WebSocketServer {
  constructor(
    { sslOptions, wsPort, ...options }: VuuWebSocketOptions,
    factory: ViewServerHandlerFactory,
  ) {

    const websocketServer = Bun.serve({
      certFile: sslEnabled(sslOptions) ? sslOptions.certPath : undefined,
      keyFile: sslEnabled(sslOptions) ? sslOptions.keyPath : undefined,
      port: wsPort,

      async fetch(req, server) {
        const sessionId = uuid();
        console.log(
          `[VUU:server] websocket upgrade request sessionId ${sessionId}`,
        );
        const success = server.upgrade(req, { data: { sessionId } });
        if (success) {
          // Bun automatically returns a 101 Switching Protocols
          // if the upgrade succeeds
          return undefined;
        }
      },
      websocket: BunWebSocketConnectionHandler(options, factory.create()),
    });

    console.log(
      `[VUU] Websocket listening on ${websocketServer.hostname}:${websocketServer.port}`,
    );

    // TODO WebSocketserver needs run via LIfecycle container
    process.on("SIGINT", () => {
      websocketServer.stop();
      process.exit();
    });
  }
}
