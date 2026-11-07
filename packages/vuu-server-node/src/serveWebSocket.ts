import { WebSocketServer, type WebSocket } from "ws";
import type {
  Channel,
  RunningServer,
  ServeWebSocketOptions,
} from "@heswell/vuu-server";
import { close, createNodeServer, listen } from "./listen";

const NOT_FOUND =
  "HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: 9\r\n\r\nNot found";

/**
 * Websocket server on node:http(s) and ws. Mirrors Bun.serve: upgrades only
 * on `path`, and closes a connection that has sent nothing (pongs included)
 * for about `idleTimeoutSeconds`: it pings every half timeout and drops a
 * connection that sent nothing since the previous ping.
 */
export async function serveWebSocket({
  close: onClose,
  createData,
  idleTimeoutSeconds,
  maxPayloadLength,
  message,
  open,
  path,
  port,
  tls,
}: ServeWebSocketOptions): Promise<RunningServer> {
  const server = createNodeServer(tls);
  const wss = new WebSocketServer({ noServer: true, maxPayload: maxPayloadLength });
  const alive = new WeakMap<WebSocket, boolean>();

  server.on("request", (_req, res) => {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  });

  server.on("upgrade", (req, socket, head) => {
    if (new URL(req.url ?? "/", "http://localhost").pathname !== path) {
      socket.end(NOT_FOUND);
      return;
    }
    const data = createData();
    wss.handleUpgrade(req, socket, head, (ws) => {
      const channel: Channel = {
        data,
        send: (text) => ws.send(text),
        close: (code, reason) => ws.close(code, reason),
      };
      alive.set(ws, true);
      const markAlive = () => alive.set(ws, true);
      ws.on("pong", markAlive);
      ws.on("message", (raw) => {
        markAlive();
        void message(channel, raw.toString());
      });
      ws.once("close", (code, reason) => onClose(channel, code, reason.toString()));
      // An error is followed by close, which does the cleanup.
      ws.on("error", () => {});
      open(channel);
    });
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        ws.terminate();
      } else {
        alive.set(ws, false);
        ws.ping();
      }
    }
  }, (idleTimeoutSeconds * 1000) / 2);
  heartbeat.unref();

  let boundPort: number;
  try {
    boundPort = await listen(server, port);
  } catch (error) {
    clearInterval(heartbeat);
    throw error;
  }
  return {
    hostname: "localhost",
    port: boundPort,
    stop: async () => {
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await close(server);
    },
  };
}
