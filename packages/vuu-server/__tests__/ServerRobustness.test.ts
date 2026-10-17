import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  getLogSink,
  setLogSink,
  type LogEntry,
  type LogSink,
} from "@heswell/service-utils";
import { TableDef } from "../src/api/TableDef";
import { VuuServer } from "../src/core/VuuServer";
import {
  VuuServerConfig,
  VuuWebSocketOptions,
  type SessionLimitPolicy,
} from "../src/core/VuuServerOptions";
import { ModuleFactory } from "../src/core/module/ModuleFactory";
import { VuuUserWithAuthorizations } from "../src/core/auths/VuuUser";
import { LoginTokenService } from "../src/net/auth/LoginTokenService";
import { VuuCloseCode } from "../src/net/CloseCodes";
import { ClientSessionId } from "../src/net/ClientConnectionCreator";
import { Provider } from "../src/provider/Provider";
import { LifecycleContainer } from "../src/toolbox/thread/LifecycleContainer";
import type { DataTable } from "../src/core/table/InMemDataTable";
import {
  installUnhandledRejectionGuard,
  isUnhandledRejectionGuardInstalled,
  uninstallUnhandledRejectionGuard,
} from "../src/core/UnhandledRejectionGuard";

type WireMessage = { requestId: string; sessionId: string; body: any };

type TestClient = {
  closed: Promise<{ code: number; reason: string }>;
  close: () => void;
  isOpen: () => boolean;
  /** raw (non-JSON) text frames received */
  text: string[];
  request: (
    requestId: string,
    body: unknown,
    sessionId?: string,
  ) => Promise<WireMessage>;
  sendRaw: (data: string) => void;
  next: () => Promise<WireMessage>;
};

class InstrumentProvider extends Provider {
  async load() {
    this.table.insert(["AAA.L", "AAA"]);
    this.table.insert(["BBB.L", "BBB"]);
  }
}

const instruments = () =>
  ModuleFactory.withNameSpace("TEST")
    .addTable(
      TableDef({
        columns: [
          { name: "ric", dataType: "string" },
          { name: "description", dataType: "string" },
        ],
        joinFields: "ric",
        keyField: "ric",
        name: "instruments",
      }),
      (table) => new InstrumentProvider(table),
    )
    .asModule();

const createVp = (table = "instruments") => ({
  type: "CREATE_VP",
  table: { module: "TEST", table },
  aggregations: [],
  columns: ["ric", "description"],
  filterSpec: { filter: "" },
  groupBy: [],
  range: { from: 0, to: 10 },
  sort: { sortDefs: [] },
});

let servers: LifecycleContainer[] = [];
let clients: TestClient[] = [];
let logs: LogEntry[] = [];
let previousSink: LogSink;
const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);

beforeEach(() => {
  logs = [];
  unhandled.length = 0;
  previousSink = getLogSink();
  setLogSink((entry) => logs.push(entry));
  process.on("unhandledRejection", onUnhandled);
});

afterEach(async () => {
  clients.forEach((client) => client.close());
  clients = [];
  for (const lifecycle of servers) await lifecycle.destroy();
  servers = [];
  setLogSink(previousSink);
  process.off("unhandledRejection", onUnhandled);
  expect(unhandled).toEqual([]);
});

async function startServer({
  maxSessionsPerUser = 1,
  sessionLimitPolicy,
}: {
  maxSessionsPerUser?: number;
  sessionLimitPolicy?: SessionLimitPolicy;
} = {}) {
  const lifecycle = new LifecycleContainer();
  const loginTokenService = LoginTokenService();
  const server = new VuuServer(
    VuuServerConfig(
      VuuWebSocketOptions()
        .withWsPort(0)
        .withMaxSessionsPerUser(maxSessionsPerUser, sessionLimitPolicy),
      {},
      loginTokenService,
    ).withModule(instruments()),
    lifecycle,
  );
  servers.push(lifecycle);
  await lifecycle.start();
  const port = server.webSocketPort as number;
  const tokenFor = (user: string) =>
    loginTokenService.getToken(VuuUserWithAuthorizations(user, []));
  const login = async (user = "steve") => {
    const client = await connect(port);
    const response = await Promise.race([
      client.request("login", { type: "LOGIN", token: tokenFor(user) }),
      client.closed.then(() => undefined),
    ]);
    return { client, response, sessionId: response?.sessionId as string };
  };
  return { login, port, server, tokenFor };
}

function connect(port: number) {
  return new Promise<TestClient>((resolve, reject) => {
    const socket = new WebSocket(`ws://localhost:${port}/websocket`);
    const pending = new Map<string, (message: WireMessage) => void>();
    const queue: WireMessage[] = [];
    const waiting: Array<(message: WireMessage) => void> = [];
    const text: string[] = [];
    const closed = Promise.withResolvers<{ code: number; reason: string }>();
    socket.addEventListener("error", () => reject(Error("WebSocket failed")));
    socket.addEventListener("close", ({ code, reason }) =>
      closed.resolve({ code, reason }),
    );
    socket.addEventListener("message", ({ data }) => {
      let messages: WireMessage | WireMessage[];
      try {
        messages = JSON.parse(String(data));
      } catch {
        text.push(String(data));
        return;
      }
      for (const message of Array.isArray(messages) ? messages : [messages]) {
        if (message.body?.type === "TABLE_ROW" || message.body?.type === "HB") {
          continue;
        }
        const resolveRequest = pending.get(message.requestId);
        if (resolveRequest) {
          pending.delete(message.requestId);
          resolveRequest(message);
        } else if (waiting.length) {
          waiting.shift()?.(message);
        } else {
          queue.push(message);
        }
      }
    });
    socket.addEventListener("open", () => {
      const client: TestClient = {
        closed: closed.promise,
        close: () => socket.close(),
        isOpen: () => socket.readyState === WebSocket.OPEN,
        text,
        request: (requestId, body, sessionId = "") =>
          new Promise((resolveRequest) => {
            pending.set(requestId, resolveRequest);
            socket.send(
              JSON.stringify({ body, module: "CORE", requestId, sessionId }),
            );
          }),
        sendRaw: (data) => socket.send(data),
        next: () =>
          new Promise((resolveNext) => {
            const message = queue.shift();
            if (message) resolveNext(message);
            else waiting.push(resolveNext);
          }),
      };
      clients.push(client);
      resolve(client);
    });
  });
}

const errorLogs = () => logs.filter(({ level }) => level === "error");
const hasStack = ({ args }: LogEntry) =>
  args.some((arg) => arg instanceof Error);

describe("a failing request does not stop the server (trader upstream issue 71)", () => {
  test("GET_TABLE_META and CREATE_VP for an unknown table are rejected", async () => {
    const { login } = await startServer();
    const { client, sessionId } = await login();

    const meta = await client.request(
      "meta-1",
      { type: "GET_TABLE_META", table: { module: "TEST", table: "nope" } },
      sessionId,
    );
    expect(meta.body).toEqual({ type: "ERROR", msg: "table not found nope" });

    const created = await client.request("vp-1", createVp("nope"), sessionId);
    expect(created.body).toEqual({
      type: "CREATE_VP_REJECT",
      msg: "table not found nope",
      table: { module: "TEST", table: "nope" },
    });

    // an expected refusal: warn, no stack
    expect(errorLogs()).toEqual([]);
    const refusals = logs.filter(({ level }) => level === "warn");
    expect(refusals.length).toBeGreaterThanOrEqual(2);
    expect(refusals.some(hasStack)).toBe(false);

    // the server and the session are still alive
    expect(client.isOpen()).toBe(true);
    const ok = await client.request("vp-2", createVp(), sessionId);
    expect(ok.body.type).toBe("CREATE_VP_SUCCESS");
  });

  test("a throwing GET_TABLE_META / CREATE_VP is answered with a reject and logged at error", async () => {
    const { login, server } = await startServer();
    const { client, sessionId } = await login();
    const container = server.viewPortContainer;
    container.getTableMetaColumns = () => {
      throw Error("meta exploded");
    };
    container.getViewPortDefinition = () => {
      throw Error("service factory exploded");
    };

    const meta = await client.request(
      "meta-1",
      {
        type: "GET_TABLE_META",
        table: { module: "TEST", table: "instruments" },
      },
      sessionId,
    );
    expect(meta.body).toEqual({
      type: "ERROR",
      msg: "Failed to process request meta-1",
    });

    const created = await client.request("vp-1", createVp(), sessionId);
    expect(created.body).toEqual({
      type: "CREATE_VP_REJECT",
      msg: "Failed to process request vp-1",
      table: { module: "TEST", table: "instruments" },
    });

    const errors = errorLogs();
    expect(errors.map(({ name }) => name)).toEqual(["vuu.core", "vuu.core"]);
    expect(errors.every(hasStack)).toBe(true);

    const list = await client.request(
      "list-1",
      { type: "GET_TABLE_LIST" },
      sessionId,
    );
    expect(list.body.type).toBe("TABLE_LIST_RESP");
    expect(client.isOpen()).toBe(true);
  });

  test("a session table of another session is not found", async () => {
    const { login, server } = await startServer({ maxSessionsPerUser: 2 });
    const a = await login();
    const b = await login();
    const sessionTable = server.tableContainer.createSimpleSessionTable(
      server.tableContainer.getTable<DataTable>("instruments"),
      ClientSessionId(a.sessionId, "irrelevant"),
    );
    const table = { module: "TEST", table: sessionTable.name };

    const meta = await b.client.request(
      "meta-1",
      { type: "GET_TABLE_META", table },
      b.sessionId,
    );
    expect(meta.body).toEqual({
      type: "ERROR",
      msg: `table not found ${sessionTable.name}`,
    });
    const created = await b.client.request(
      "vp-1",
      { ...createVp(), table },
      b.sessionId,
    );
    expect(created.body).toMatchObject({ type: "CREATE_VP_REJECT", table });

    const own = await a.client.request(
      "vp-1",
      { ...createVp(), table },
      a.sessionId,
    );
    expect(own.body.type).toBe("CREATE_VP_SUCCESS");
    expect(errorLogs()).toEqual([]);
  });

  test("malformed and unsupported messages are answered with ERROR", async () => {
    const { login } = await startServer();
    const { client, sessionId } = await login();

    client.sendRaw("{not json");
    expect((await client.next()).body).toEqual({
      type: "ERROR",
      msg: "invalid message",
    });

    const unsupported = await client.request(
      "x-1",
      { type: "NO_SUCH_MESSAGE" },
      sessionId,
    );
    expect(unsupported.body).toEqual({
      type: "ERROR",
      msg: "unsupported message type NO_SUCH_MESSAGE",
    });

    expect(errorLogs()).toEqual([]);
    expect(client.isOpen()).toBe(true);
  });
});

describe("cross-session viewport requests (trader upstream issue 69)", () => {
  test("are refused at warn without a stack trace", async () => {
    const { login } = await startServer({ maxSessionsPerUser: 2 });
    const a = await login();
    const b = await login();
    const created = await a.client.request("vp-1", createVp(), a.sessionId);
    const vpId = created.body.viewPortId as string;

    const rpc = await b.client.request(
      "rpc-1",
      {
        type: "RPC_REQUEST",
        rpcName: "editCell",
        params: {},
        context: { type: "VIEWPORT_CONTEXT", viewPortId: vpId },
      },
      b.sessionId,
    );
    expect(rpc.body).toMatchObject({
      type: "RPC_RESPONSE",
      rpcName: "editCell",
      result: {
        type: "ERROR_RESULT",
        errorMessage: `viewport not found ${vpId}`,
      },
    });

    const menu = await b.client.request(
      "menus-1",
      { type: "GET_VIEW_PORT_MENUS", vpId },
      b.sessionId,
    );
    expect(menu.body).toEqual({
      type: "ERROR",
      msg: `viewport not found ${vpId}`,
    });

    const select = await b.client.request(
      "select-1",
      {
        type: "SELECT_ROW",
        vpId,
        rowKey: "AAA.L",
        preserveExistingSelection: false,
      },
      b.sessionId,
    );
    expect(select.body).toEqual({
      type: "SELECT_ROW_REJECT",
      vpId,
      errorMsg: `viewport not found ${vpId}`,
    });

    expect(errorLogs()).toEqual([]);
    const refusals = logs.filter(
      ({ level, args }) =>
        level === "warn" &&
        String(args[0]).includes(`viewport not found ${vpId}`),
    );
    expect(refusals).toHaveLength(3);
    expect(refusals.some(hasStack)).toBe(false);
    expect(refusals.map(({ name }) => name)).toContain("vuu.rpc");
  });
});

describe("RPC error logging", () => {
  test("logs returned errors with request context without logging cell values", async () => {
    const { login } = await startServer();
    const { client, sessionId } = await login();
    const created = await client.request("vp-error-log", createVp(), sessionId);
    const vpId = created.body.viewPortId as string;
    const response = await client.request(
      "edit-error-log",
      {
        type: "RPC_REQUEST",
        rpcName: "editCell",
        params: { key: "AAA.L", column: "description", data: "private-cell-value" },
        context: { type: "VIEWPORT_CONTEXT", viewPortId: vpId },
      },
      sessionId,
    );
    expect(response.body.result).toEqual({
      type: "ERROR_RESULT",
      errorMessage: "rpc service editCell not implemented",
    });
    const entries = logs.filter(
      ({ level, name, args }) =>
        level === "error" &&
        name === "vuu.rpc" &&
        String(args[0]).includes("edit-error-log"),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].args).toEqual([
      `RPC editCell on vp ${vpId} failed (edit-error-log, session ${sessionId}): rpc service editCell not implemented`,
    ]);
    expect(JSON.stringify(entries)).not.toContain("private-cell-value");
  });
});

describe("maxSessionsPerUser (trader upstream issue 72)", () => {
  test("a second login evicts and fully tears down the first session", async () => {
    const { login, server } = await startServer();
    const first = await login();
    const created = await first.client.request(
      "vp-1",
      createVp(),
      first.sessionId,
    );
    expect(created.body.type).toBe("CREATE_VP_SUCCESS");
    const sessionTable = server.tableContainer.createSimpleSessionTable(
      server.tableContainer.getTable<DataTable>("instruments"),
      ClientSessionId(first.sessionId, "irrelevant"),
    );
    const sessionVp = await first.client.request(
      "vp-2",
      { ...createVp(), table: { module: "TEST", table: sessionTable.name } },
      first.sessionId,
    );
    expect(sessionVp.body.type).toBe("CREATE_VP_SUCCESS");
    expect(server.viewPortContainer.viewportCount).toBe(2);

    const second = await login();
    expect(second.response?.body.type).toBe("LOGIN_SUCCESS");

    expect(await first.client.closed).toEqual({
      code: VuuCloseCode.SessionEvicted,
      reason: "session evicted: user logged in again",
    });
    expect(server.viewPortContainer.viewportCount).toBe(0);
    expect(server.tableContainer.hasTable(sessionTable.name)).toBe(false);

    // the new session works
    const again = await second.client.request(
      "vp-1",
      createVp(),
      second.sessionId,
    );
    expect(again.body.type).toBe("CREATE_VP_SUCCESS");
    expect(server.viewPortContainer.viewportCount).toBe(1);
    expect(errorLogs()).toEqual([]);
  });

  test("a session id is only accepted on the channel that logged in", async () => {
    const { login, server } = await startServer({ maxSessionsPerUser: 2 });
    const first = await login();
    const other = await login();
    // a session id is only valid on the channel that logged in
    const hijack = other.client;
    hijack.request("vp-1", createVp(), first.sessionId);
    expect(await hijack.closed).toEqual({
      code: VuuCloseCode.InvalidSession,
      reason: `Invalid session ${first.sessionId}`,
    });
    expect(hijack.text).toEqual([`Invalid session ${first.sessionId}`]);
    expect(server.viewPortContainer.viewportCount).toBe(0);

    // the legitimate owner is unaffected
    const own = await first.client.request("vp-1", createVp(), first.sessionId);
    expect(own.body.type).toBe("CREATE_VP_SUCCESS");
  });

  test("reject-new refuses the login and keeps the first session", async () => {
    const { login } = await startServer({ sessionLimitPolicy: "reject-new" });
    const first = await login();
    const refused = await login();
    expect(refused.response).toBeUndefined();
    expect(await refused.client.closed).toEqual({
      code: VuuCloseCode.SessionLimitReached,
      reason: "maximum sessions (1) reached for user steve",
    });
    expect(first.client.isOpen()).toBe(true);
    const ok = await first.client.request("vp-1", createVp(), first.sessionId);
    expect(ok.body.type).toBe("CREATE_VP_SUCCESS");

    // other users are not affected
    const alice = await login("alice");
    expect(alice.response?.body.type).toBe("LOGIN_SUCCESS");
  });

  test("closing the websocket removes its session, viewports and session tables", async () => {
    const { login, server } = await startServer({
      sessionLimitPolicy: "reject-new",
    });
    const first = await login();
    await first.client.request("vp-1", createVp(), first.sessionId);
    const sessionTable = server.tableContainer.createSimpleSessionTable(
      server.tableContainer.getTable<DataTable>("instruments"),
      ClientSessionId(first.sessionId, "irrelevant"),
    );
    expect(server.viewPortContainer.viewportCount).toBe(1);

    first.client.close();
    await first.client.closed;
    await Bun.sleep(20);
    expect(server.viewPortContainer.viewportCount).toBe(0);
    expect(server.tableContainer.hasTable(sessionTable.name)).toBe(false);

    // the session no longer counts against the limit
    const second = await login();
    expect(second.response?.body.type).toBe("LOGIN_SUCCESS");
  });

  test("invalid limits are refused", () => {
    expect(() => VuuWebSocketOptions().withMaxSessionsPerUser(0)).toThrow(
      "Invalid maxSessionsPerUser '0'",
    );
    expect(() =>
      VuuWebSocketOptions().withMaxSessionsPerUser(
        1,
        "nope" as SessionLimitPolicy,
      ),
    ).toThrow("Invalid sessionLimitPolicy 'nope'");
  });
});

describe("unhandledRejection guard", () => {
  test("logs an unhandled rejection at error and can be removed", async () => {
    expect(isUnhandledRejectionGuardInstalled()).toBe(false);
    const uninstall = installUnhandledRejectionGuard();
    try {
      // bun test reports a real unhandled rejection as a test failure, so
      // deliver the event the way the runtime would
      const error = Error("forgotten");
      process.emit(
        "unhandledRejection",
        error,
        Promise.reject(error).catch(() => {}),
      );
      const [entry] = errorLogs();
      expect(entry.name).toBe("vuu.core");
      expect(String(entry.args[0])).toContain("unhandled promise rejection");
      expect((entry.args[1] as Error).message).toBe("forgotten");
    } finally {
      uninstall();
      // this test's own listener saw it as well
      unhandled.length = 0;
    }
    expect(isUnhandledRejectionGuardInstalled()).toBe(false);
  });
});
