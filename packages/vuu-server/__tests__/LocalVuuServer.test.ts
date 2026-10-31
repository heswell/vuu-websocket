import { afterEach, describe, expect, test } from "bun:test";
import {
  createLocalVuuServer,
  createLocalWebSocketClass,
  LocalLoginTokenService,
  type LocalPortOpener,
  type LocalVuuServer,
  openPortVia,
} from "../src/browser";
import { VuuCloseCode } from "../src/net/CloseCodes";
import {
  createInstrumentsVp,
  instrumentsModule,
} from "./fixtures/instruments-module";

type WireMessage = {
  requestId: string;
  sessionId: string;
  body: { type: string; [key: string]: unknown };
};

type TestClient = {
  socket: WebSocket;
  closed: Promise<{ code: number; reason: string }>;
  /** Raw (non-JSON) text frames, e.g. a login failure. */
  text: string[];
  /** Every parsed message, in arrival order. */
  received: WireMessage[];
  request: (
    requestId: string,
    body: unknown,
    sessionId?: string,
  ) => Promise<WireMessage>;
  waitFor: (predicate: (message: WireMessage) => boolean) => Promise<WireMessage>;
};

const servers: LocalVuuServer[] = [];
const cleanups: Array<() => void> = [];

afterEach(async () => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  for (const server of servers.splice(0)) await server.stop();
});

async function startServer(
  options: Partial<Parameters<typeof createLocalVuuServer>[0]> = {},
) {
  const server = createLocalVuuServer({
    modules: [instrumentsModule()],
    ...options,
  });
  servers.push(server);
  await server.start();
  return server;
}

/** Connects the way a Vuu UI client does: `new WebSocket(url)`. */
function connect(openPort: LocalPortOpener) {
  const LocalWebSocket = createLocalWebSocketClass(openPort);
  return new Promise<TestClient>((resolve, reject) => {
    const socket = new LocalWebSocket("ws://local/websocket") as WebSocket;
    const pending = new Map<string, (message: WireMessage) => void>();
    const watchers = new Set<{
      predicate: (message: WireMessage) => boolean;
      resolve: (message: WireMessage) => void;
    }>();
    const received: WireMessage[] = [];
    const text: string[] = [];
    const closed = Promise.withResolvers<{ code: number; reason: string }>();

    socket.onerror = () => reject(Error("socket error"));
    socket.onclose = ({ code, reason }) => closed.resolve({ code, reason });
    socket.onmessage = ({ data }) => {
      let message: WireMessage;
      try {
        message = JSON.parse(String(data));
      } catch {
        text.push(String(data));
        return;
      }
      received.push(message);
      pending.get(message.requestId)?.(message);
      pending.delete(message.requestId);
      for (const watcher of watchers) {
        if (watcher.predicate(message)) {
          watchers.delete(watcher);
          watcher.resolve(message);
        }
      }
    };
    socket.onopen = () => {
      const client: TestClient = {
        socket,
        closed: closed.promise,
        text,
        received,
        request: (requestId, body, sessionId = "") =>
          new Promise((resolveRequest) => {
            pending.set(requestId, resolveRequest);
            socket.send(
              JSON.stringify({ body, module: "CORE", requestId, sessionId }),
            );
          }),
        waitFor: (predicate) =>
          new Promise((resolveWatch) => {
            const seen = received.find(predicate);
            if (seen) resolveWatch(seen);
            else watchers.add({ predicate, resolve: resolveWatch });
          }),
      };
      cleanups.push(() => socket.close());
      resolve(client);
    };
  });
}

const login = (client: TestClient, token = "no-token") =>
  client.request("login", { type: "LOGIN", token });

/** Logs in, opens a viewport on TEST.instruments and returns its rows. */
async function loadInstruments(client: TestClient) {
  const { body: loginBody, sessionId } = await login(client);
  expect(loginBody.type).toBe("LOGIN_SUCCESS");
  expect(sessionId).toBeString();

  const created = await client.request("vp1", createInstrumentsVp, sessionId);
  expect(created.body.type).toBe("CREATE_VP_SUCCESS");
  const viewPortId = created.body.viewPortId as string;

  const rowsMessage = await client.waitFor(
    ({ body }) =>
      body.type === "TABLE_ROW" &&
      (body.rows as Array<{ updateType: string }>).some(
        ({ updateType }) => updateType === "U",
      ),
  );
  const rows = (rowsMessage.body.rows as Array<{
    data: unknown[];
    updateType: string;
    viewPortId: string;
  }>).filter(({ updateType }) => updateType === "U");
  expect(rows.every((row) => row.viewPortId === viewPortId)).toBe(true);
  return rows.map(({ data }) => data).sort();
}

describe("LocalVuuServer", () => {
  test("serves the Vuu protocol to a WebSocket stand-in in the same thread", async () => {
    const server = await startServer();
    const client = await connect(() => server.openPort());

    expect(await loadInstruments(client)).toEqual([
      ["AAA.L", "AAA"],
      ["BBB.L", "BBB"],
      ["CCC.L", "CCC"],
    ]);

    const { sessionId } = client.received[0];
    const tables = await client.request(
      "tables",
      { type: "GET_TABLE_LIST" },
      sessionId,
    );
    expect(tables.body.type).toBe("TABLE_LIST_RESP");
    expect(tables.body.tables).toContainEqual({
      module: "TEST",
      table: "instruments",
    });
  });

  test("accepts connections handed over on a connector port", async () => {
    const server = await startServer();
    const { port1, port2 } = new MessageChannel();
    server.acceptConnections(port2);
    cleanups.push(() => port1.close());

    const [first, second] = await Promise.all([
      connect(openPortVia(port1)),
      connect(openPortVia(port1)),
    ]);
    expect(await loadInstruments(first)).toHaveLength(3);
    expect(await loadInstruments(second)).toHaveLength(3);
    expect(first.received[0].sessionId).not.toBe(second.received[0].sessionId);
  });

  test("a refused login sends the error and closes the connection", async () => {
    const server = await startServer({
      loginTokenService: LocalLoginTokenService({ acceptUnknownTokens: false }),
    });
    const client = await connect(() => server.openPort());
    client.socket.send(
      JSON.stringify({
        body: { type: "LOGIN", token: "forged" },
        module: "CORE",
        requestId: "login",
        sessionId: "",
      }),
    );
    const { code } = await client.closed;
    expect(code).toBe(VuuCloseCode.LoginFailed);
    expect(client.text).toEqual(["Invalid token"]);
    expect(client.socket.readyState).toBe(WebSocket.CLOSED);
  });

  test("tokens issued by the token service log in as their user", async () => {
    const tokens = LocalLoginTokenService({ acceptUnknownTokens: false });
    const { VuuUserWithAuthorizations } = await import("../src/browser");
    const token = tokens.getToken(VuuUserWithAuthorizations("steve"));
    const server = await startServer({ loginTokenService: tokens });
    const client = await connect(() => server.openPort());
    expect((await login(client, token)).body.type).toBe("LOGIN_SUCCESS");
  });

  test("stopping the server closes open connections", async () => {
    const server = await startServer();
    const client = await connect(() => server.openPort());
    await login(client);
    servers.splice(servers.indexOf(server), 1);
    await server.stop();
    expect((await client.closed).code).toBe(1001);
  });

  test("a client close ends its session on the server", async () => {
    // One session per user, further logins refused: a second login only
    // succeeds if closing the first connection removed its session.
    const server = await startServer({
      maxSessionsPerUser: 1,
      sessionLimitPolicy: "reject-new",
    });
    const first = await connect(() => server.openPort());
    expect((await login(first)).body.type).toBe("LOGIN_SUCCESS");

    const refused = await connect(() => server.openPort());
    refused.socket.send(
      JSON.stringify({
        body: { type: "LOGIN", token: "no-token" },
        module: "CORE",
        requestId: "login",
        sessionId: "",
      }),
    );
    expect((await refused.closed).code).toBe(VuuCloseCode.SessionLimitReached);

    first.socket.close();
    await first.closed;
    // The client doesn't wait for the server to process the close.
    await Bun.sleep(10);

    const second = await connect(() => server.openPort());
    expect((await login(second)).body.type).toBe("LOGIN_SUCCESS");
  });

  test("runs in a Web Worker, reached through the worker as connector", async () => {
    const worker = new Worker(
      new URL("./fixtures/local-server-worker.ts", import.meta.url),
    );
    cleanups.push(() => worker.terminate());
    await new Promise<void>((resolve) => {
      worker.addEventListener("message", ({ data }) => {
        if (data?.type === "ready") resolve();
      });
    });

    const client = await connect(openPortVia(worker));
    expect(await loadInstruments(client)).toEqual([
      ["AAA.L", "AAA"],
      ["BBB.L", "BBB"],
      ["CCC.L", "CCC"],
    ]);
  });
});
