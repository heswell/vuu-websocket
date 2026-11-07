import type { ServerWebSocket } from "bun";
import type { WebsocketData } from "@heswell/service-utils/browser";
import { getLogger } from "@heswell/service-utils/browser";
import type {
  RunningServer,
  ServerRuntime,
  TlsFiles,
} from "./ServerRuntime";

const log = getLogger("vuu.net");
const WEBSOCKET_STOP_TIMEOUT_MS = 250;

const tlsOf = (tls?: TlsFiles) =>
  tls ? { cert: Bun.file(tls.certPath), key: Bun.file(tls.keyPath) } : undefined;

const running = (
  server: Bun.Server<unknown>,
  stop: () => Promise<void>,
): RunningServer => ({
  hostname: server.hostname ?? "localhost",
  port: server.port ?? 0,
  stop,
});

// Bun (1.3.x) never settles the forced stop promise once the server has
// closed a websocket itself (eviction, invalid session, login failure),
// although the listener and all connections are closed. Don't wait for it
// indefinitely.
async function stopWebSocketServer(server: Bun.Server<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stopped = await Promise.race([
    server.stop(true).then(() => true),
    new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), WEBSOCKET_STOP_TIMEOUT_MS);
    }),
  ]);
  clearTimeout(timer);
  if (!stopped) {
    log.debug(
      `WebSocket server stop did not settle within ${WEBSOCKET_STOP_TIMEOUT_MS}ms, continuing`,
    );
  }
}

/** The Bun runtime: Bun.serve for HTTP and websockets, Bun.YAML. */
export const bunRuntime: ServerRuntime = {
  name: "bun",

  async serveHttp({ fetch, port, tls }) {
    const server = Bun.serve({
      port,
      tls: tlsOf(tls),
      async fetch(req) {
        try {
          return (await fetch(req)) ?? new Response("Not found", { status: 404 });
        } catch (error) {
          log.error(`HTTP ${req.method} ${new URL(req.url).pathname} failed`, error);
          return new Response("Internal server error", { status: 500 });
        }
      },
    });
    return running(server, () => server.stop(true));
  },

  async serveWebSocket({
    close,
    createData,
    idleTimeoutSeconds,
    maxPayloadLength,
    message,
    open,
    path,
    port,
    tls,
  }) {
    const server = Bun.serve<WebsocketData>({
      port,
      tls: tlsOf(tls),
      fetch(req, server) {
        if (new URL(req.url).pathname !== path) {
          return new Response("Not found", { status: 404 });
        }
        // Bun returns 101 Switching Protocols itself when the upgrade succeeds.
        if (server.upgrade(req, { data: createData() })) {
          return undefined;
        }
        return new Response("Not found", { status: 404 });
      },
      websocket: {
        maxPayloadLength,
        idleTimeout: idleTimeoutSeconds,
        open: (ws: ServerWebSocket<WebsocketData>) => open(ws),
        message: (ws: ServerWebSocket<WebsocketData>, msg: string | Buffer) =>
          message(ws, String(msg)),
        drain: () => log.debug("WebSocket backpressure (drain)"),
        close: (
          ws: ServerWebSocket<WebsocketData>,
          code: number,
          reason: string,
        ) => close(ws, code, reason),
      },
    });
    return running(server, () => stopWebSocketServer(server));
  },

  yaml: {
    parse: (text) => Bun.YAML.parse(text),
    stringify: (value) => Bun.YAML.stringify(value, null, 2),
  },
};
