/**
 * The behaviour every ServerRuntime must have. Run against bunRuntime here
 * and against nodeRuntime in @heswell/vuu-server-node.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import type {
  Channel,
  RunningServer,
  ServerRuntime,
  ServeWebSocketOptions,
} from "../../src";

const certPath = fileURLToPath(
  new URL("../../../../apps/vuu-demo/certs/cert.pem", import.meta.url),
);
const keyPath = fileURLToPath(
  new URL("../../../../apps/vuu-demo/certs/key.pem", import.meta.url),
);

type Event =
  | { type: "open"; sessionId: string }
  | { type: "message"; sessionId: string; message: string }
  | { type: "close"; sessionId: string; code: number };

const waitFor = async (predicate: () => boolean, timeoutMs = 2000) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const openClient = (url: string) =>
  new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(Error(`could not connect to ${url}`));
  });

export function describeServerRuntime(runtime: ServerRuntime) {
  describe(`ServerRuntime contract: ${runtime.name}`, () => {
    const servers: RunningServer[] = [];
    const track = (server: RunningServer) => {
      servers.push(server);
      return server;
    };
    afterEach(async () => {
      await Promise.all(servers.splice(0).map((server) => server.stop()));
    });

    describe("serveHttp", () => {
      const serve = () =>
        runtime
          .serveHttp({
            port: 0,
            async fetch(req) {
              const url = new URL(req.url);
              if (url.pathname === "/echo") {
                const headers = new Headers({ "content-type": "application/json" });
                headers.append("set-cookie", "a=1");
                headers.append("set-cookie", "b=2");
                return new Response(
                  JSON.stringify({
                    method: req.method,
                    search: url.search,
                    header: req.headers.get("x-test"),
                    body: req.method === "POST" ? await req.json() : null,
                  }),
                  { status: 201, headers },
                );
              }
              if (url.pathname === "/fail") throw Error("boom");
              return undefined;
            },
          })
          .then(track);

      test("binds an ephemeral port and reports it", async () => {
        const server = await serve();
        expect(server.port).toBeGreaterThan(0);
        expect(server.hostname).toBeString();
      });

      test("passes method, query, headers and body; returns status, headers and body", async () => {
        const server = await serve();
        const response = await fetch(`http://localhost:${server.port}/echo?x=1`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-test": "yes" },
          body: JSON.stringify({ hello: "world" }),
        });
        expect(response.status).toBe(201);
        expect(response.headers.getSetCookie()).toEqual(["a=1", "b=2"]);
        expect(await response.json()).toEqual({
          method: "POST",
          search: "?x=1",
          header: "yes",
          body: { hello: "world" },
        });
      });

      test("answers 404 when the handler returns undefined", async () => {
        const server = await serve();
        const response = await fetch(`http://localhost:${server.port}/nothing`);
        expect(response.status).toBe(404);
      });

      test("answers 500 when the handler throws", async () => {
        const server = await serve();
        const response = await fetch(`http://localhost:${server.port}/fail`);
        expect(response.status).toBe(500);
      });

      test("stop closes the listener", async () => {
        const server = await runtime.serveHttp({
          port: 0,
          fetch: () => new Response("ok"),
        });
        const { port } = server;
        expect(await (await fetch(`http://localhost:${port}/`)).text()).toBe("ok");
        await server.stop();
        await expect(fetch(`http://localhost:${port}/`)).rejects.toThrow();
      });

      test("serves https with the given cert and key", async () => {
        const server = track(
          await runtime.serveHttp({
            port: 0,
            tls: { certPath, keyPath },
            fetch: () => new Response("secure"),
          }),
        );
        const response = await fetch(`https://localhost:${server.port}/`, {
          tls: { rejectUnauthorized: false },
        } as RequestInit);
        expect(await response.text()).toBe("secure");
      });

      test("fails to start on a port in use", async () => {
        const server = await serve();
        await expect(
          runtime.serveHttp({ port: server.port, fetch: () => undefined }),
        ).rejects.toThrow();
      });
    });

    describe("serveWebSocket", () => {
      let nextSession = 0;

      // Fresh state per test, so late close events from one test's
      // connections can't leak into the next.
      const harness = () => {
        const events: Event[] = [];
        const channels = new Map<string, Channel>();
        const serve = (overrides: Partial<ServeWebSocketOptions> = {}) =>
          runtime
            .serveWebSocket({
              port: 0,
              path: "/websocket",
              maxPayloadLength: 1024 * 1024,
              idleTimeoutSeconds: 10,
              createData: () => ({ sessionId: `s${++nextSession}` }),
              open: (channel) => {
                channels.set(channel.data.sessionId, channel);
                events.push({ type: "open", sessionId: channel.data.sessionId });
              },
              message: (channel, message) => {
                events.push({
                  type: "message",
                  sessionId: channel.data.sessionId,
                  message,
                });
                channel.send(`echo:${message}`);
              },
              close: (channel, code) => {
                events.push({ type: "close", sessionId: channel.data.sessionId, code });
              },
              ...overrides,
            })
            .then(track);
        return { channels, events, serve };
      };

      test("exchanges text messages on the configured path", async () => {
        const { channels, events, serve } = harness();
        const server = await serve();
        const client = await openClient(`ws://localhost:${server.port}/websocket`);
        const received: string[] = [];
        client.onmessage = (event) => received.push(String(event.data));
        client.send("hello");
        await waitFor(() => received.length === 1);
        expect(received).toEqual(["echo:hello"]);
        const [open, message] = events;
        expect(open).toMatchObject({ type: "open" });
        expect(message).toEqual({
          type: "message",
          sessionId: open.sessionId,
          message: "hello",
        });
        client.close();
      });

      test("gives each connection its own data", async () => {
        const { channels, events, serve } = harness();
        const server = await serve();
        const url = `ws://localhost:${server.port}/websocket`;
        const [a, b] = await Promise.all([openClient(url), openClient(url)]);
        await waitFor(() => channels.size === 2);
        const ids = [...channels.keys()];
        expect(new Set(ids).size).toBe(2);
        a.close();
        b.close();
      });

      test("refuses other paths", async () => {
        const { channels, events, serve } = harness();
        const server = await serve();
        await expect(
          openClient(`ws://localhost:${server.port}/other`),
        ).rejects.toThrow();
        const response = await fetch(`http://localhost:${server.port}/websocket`);
        expect(response.status).toBe(404);
        expect(events).toEqual([]);
      });

      test("a server close reaches the client with its code, and the close callback runs", async () => {
        const { channels, events, serve } = harness();
        const server = await serve();
        const client = await openClient(`ws://localhost:${server.port}/websocket`);
        const closed = new Promise<number>((resolve) => {
          client.onclose = (event) => resolve(event.code);
        });
        await waitFor(() => channels.size === 1);
        const [channel] = channels.values();
        channel.close(4001, "evicted");
        expect(await closed).toBe(4001);
        await waitFor(() => events.some((event) => event.type === "close"));
        expect(events.at(-1)).toMatchObject({ type: "close", code: 4001 });
      });

      test("a client close runs the close callback", async () => {
        const { channels, events, serve } = harness();
        const server = await serve();
        const client = await openClient(`ws://localhost:${server.port}/websocket`);
        await waitFor(() => channels.size === 1);
        client.close(1000);
        await waitFor(() => events.some((event) => event.type === "close"));
        expect(events.at(-1)).toMatchObject({ type: "close", code: 1000 });
      });

      test("stop closes open connections", async () => {
        const server = await runtime.serveWebSocket({
          port: 0,
          path: "/websocket",
          maxPayloadLength: 1024,
          idleTimeoutSeconds: 10,
          createData: () => ({ sessionId: "s" }),
          open: () => {},
          message: () => {},
          close: () => {},
        });
        const client = await openClient(`ws://localhost:${server.port}/websocket`);
        const closed = new Promise<void>((resolve) => {
          client.onclose = () => resolve();
        });
        await server.stop();
        await closed;
      });

      test("serves wss with the given cert and key", async () => {
        const { channels, events, serve } = harness();
        const server = await serve({ tls: { certPath, keyPath } });
        const client = await new Promise<WebSocket>((resolve, reject) => {
          const ws = new WebSocket(`wss://localhost:${server.port}/websocket`, {
            tls: { rejectUnauthorized: false },
          } as never);
          ws.onopen = () => resolve(ws);
          ws.onerror = () => reject(Error("could not connect"));
        });
        client.close();
      });
    });

    test("yaml round-trips", () => {
      const value = { modules: [{ id: "a", tags: ["x", "y"], size: 2, on: true }] };
      const text = runtime.yaml.stringify(value);
      expect(text).toBeString();
      expect(runtime.yaml.parse(text)).toEqual(value);
    });
  });
}
