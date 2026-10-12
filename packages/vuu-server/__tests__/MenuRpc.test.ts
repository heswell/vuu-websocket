import { afterEach, describe, expect, test } from "bun:test";
import type {
  ClientToServerMenuCellRPC,
  ClientToServerMenuGridRPC,
  ClientToServerMenuRowRPC,
  ClientToServerMenuSelectRPC,
  ShowNotificationAction,
  VuuRpcMenuAction,
  VuuRpcMenuError,
  VuuRpcMenuRequest,
  VuuRpcMenuSuccess,
  VuuViewportCreateRequest,
} from "@vuu-ui/vuu-protocol-types";
import {
  CellViewPortMenuItem,
  CloseDialog,
  Columns,
  LifecycleContainer,
  LoginTokenService,
  type MenuRpcSession,
  ModuleFactory,
  NoAction,
  NullProvider,
  OpenDialog,
  RowViewPortMenuItem,
  RpcHandler,
  SelectionViewPortMenuItem,
  ShowNotification,
  TableDef,
  TableViewPortMenuItem,
  ViewPortDef,
  ViewPortMenu,
  ViewPortMenuRpcReject,
  ViewPortMenuRpcResponse,
  type ViewPortSelection,
  VuuServer,
  VuuServerConfig,
  VuuUserWithAuthorizations,
  VuuWebSocketOptions,
} from "../src";
import { CoreServerApiHandler } from "../src/core/CoreServerApiHandler";
import type { DataTable } from "../src/core/table/InMemDataTable";
import { OutboundRowPublishQueue } from "../src/util/PublishQueue";
import type { ProviderContainer } from "../src/provider/ProviderContainer";

const MODULE = "MENU_TEST";

type Call = { rpcName: string; args: unknown[] };

class MenuService extends RpcHandler {
  calls: Call[] = [];

  private record =
    (rpcName: string) =>
    (...args: unknown[]) => {
      this.calls.push({ rpcName, args });
      return ShowNotification(`${rpcName} ok`, rpcName);
    };

  get menuItems() {
    // prettier-ignore
    return ViewPortMenu(
      new SelectionViewPortMenuItem("Select", "", this.record("SELECT"), "SELECT"),
      new SelectionViewPortMenuItem(
        "Legacy select", "",
        (selection: ViewPortSelection, sessionId: string) => {
          this.calls.push({ rpcName: "LEGACY_SELECT", args: [selection, sessionId] });
          return NoAction();
        },
        "LEGACY_SELECT",
      ),
      ViewPortMenu("Sub menu",
        new TableViewPortMenuItem("Table", "", this.record("TABLE"), "TABLE"),
        new RowViewPortMenuItem("Row", "", this.record("ROW"), "ROW"),
      ),
      new CellViewPortMenuItem("Cell", "", this.record("CELL"), "CELL", "ccy"),
      new TableViewPortMenuItem("Async", "", async () => {
        await Bun.sleep(1);
        return OpenDialog({ module: MODULE, table: "orders" }, "grid");
      }, "ASYNC"),
      new RowViewPortMenuItem("Throws", "", () => {
        throw Error("handler exploded");
      }, "THROWS"),
      new CellViewPortMenuItem("Async throws", "", async () => {
        throw Error("async handler exploded");
      }, "ASYNC_THROWS"),
      new TableViewPortMenuItem("Admin only", "", ({ user }) =>
        user.authorizations.includes("admin")
          ? ShowNotification("done")
          : ShowNotification("not permitted", "Error"),
      "ADMIN_ONLY"),
    );
  }
}

const createModule = (services: MenuService[]) =>
  ModuleFactory.withNameSpace(MODULE)
    .addTable(
      TableDef({
        name: "orders",
        keyField: "id",
        columns: Columns.fromNames("id:string", "ccy:string", "qty:int"),
      }),
      (table) => new NullProvider(table),
      (table) => {
        const service = new MenuService();
        services.push(service);
        return ViewPortDef(table.tableDef.columns, service);
      },
    )
    .asModule();

const createVpRequest = (): VuuViewportCreateRequest => ({
  type: "CREATE_VP",
  table: { module: MODULE, table: "orders" },
  aggregations: [],
  columns: ["id", "ccy", "qty"],
  filterSpec: { filter: "" },
  groupBy: [],
  range: { from: 0, to: 100 },
  sort: { sortDefs: [] },
});

const requestContext = (
  requestId: string,
  sessionId = "session-1",
  authorizations: string[] = [],
) =>
  ({
    requestId,
    session: { sessionId, channelId: "channel-1" },
    user: VuuUserWithAuthorizations("steve", authorizations),
    queue: new OutboundRowPublishQueue(),
  }) as any;

const setup = async () => {
  const services: MenuService[] = [];
  const server = new VuuServer(
    VuuServerConfig(
      VuuWebSocketOptions().withWsPort(0),
      {},
      LoginTokenService(),
    ).withModule(createModule(services)),
    new LifecycleContainer(),
  );
  const orders = server.tableContainer.getTable<DataTable>("orders");
  orders.insert(["o1", "EUR", 100]);
  orders.insert(["o2", "GBP", 200]);
  orders.insert(["o3", "EUR", 300]);
  const api = new CoreServerApiHandler(
    server.viewPortContainer,
    server.tableContainer,
    {} as ProviderContainer,
  );
  const created = await api.process(
    {
      requestId: "create",
      sessionId: "session-1",
      module: "CORE",
      body: createVpRequest(),
    } as any,
    requestContext("create"),
  );
  const vpId = (created?.body as { viewPortId: string }).viewPortId;
  const call = (
    body: VuuRpcMenuRequest,
    ctx = requestContext("menu-1"),
  ) =>
    api.process(
      { requestId: ctx.requestId, sessionId: "session-1", module: "CORE", body },
      ctx,
    );
  return { api, call, server, service: services[0], vpId };
};

const select = (vpId: string, rpcName: string): ClientToServerMenuSelectRPC => ({
  type: "VIEW_PORT_MENUS_SELECT_RPC",
  rpcName,
  vpId,
});
const grid = (vpId: string, rpcName: string): ClientToServerMenuGridRPC => ({
  type: "VIEW_PORT_MENU_TABLE_RPC",
  rpcName,
  vpId,
});
const row = (vpId: string, rpcName: string): ClientToServerMenuRowRPC => ({
  type: "VIEW_PORT_MENU_ROW_RPC",
  rpcName,
  vpId,
  rowKey: "o2",
  row: { id: "o2", ccy: "GBP", qty: 200 },
});
const cell = (vpId: string, rpcName: string): ClientToServerMenuCellRPC => ({
  type: "VIEW_PORT_MENU_CELL_RPC",
  rpcName,
  vpId,
  rowKey: "o3",
  field: "ccy",
  value: "EUR" as any,
});

const success = (
  vpId: string,
  rpcName: string,
  action: VuuRpcMenuAction,
) => ({
  body: {
    type: "VIEW_PORT_MENU_RESP",
    action,
    rpcName,
    vpId,
  } satisfies VuuRpcMenuSuccess,
  module: "CORE",
  requestId: "menu-1",
  sessionId: "session-1",
});
const reject = (vpId: string, rpcName: string, error: string) => ({
  body: {
    type: "VIEW_PORT_MENU_REJ",
    error,
    rpcName,
    vpId,
  } satisfies VuuRpcMenuError,
  module: "CORE",
  requestId: "menu-1",
  sessionId: "session-1",
});

const notification = (rpcName: string): ShowNotificationAction => ({
  type: "SHOW_NOTIFICATION_ACTION",
  message: `${rpcName} ok`,
  title: rpcName,
});

describe("menu RPC dispatch", () => {
  const silence = () => {
    const { warn, error } = console;
    console.warn = () => undefined;
    console.error = () => undefined;
    return () => {
      console.warn = warn;
      console.error = error;
    };
  };
  let restore = () => {};
  afterEach(() => restore());

  test("GET_VIEW_PORT_MENUS describes every context, cell field included", async () => {
    const { api, vpId } = await setup();
    const response = await api.process(
      {
        requestId: "menus",
        sessionId: "session-1",
        module: "CORE",
        body: { type: "GET_VIEW_PORT_MENUS", vpId },
      },
      requestContext("menus"),
    );
    const menu = (response?.body as any).menu;
    expect(menu.name).toBe("ROOT");
    expect(menu.menus[2]).toEqual({
      name: "Sub menu",
      menus: [
        { context: "grid", filter: "", name: "Table", rpcName: "TABLE" },
        { context: "row", filter: "", name: "Row", rpcName: "ROW" },
      ],
    });
    expect(menu.menus[3]).toEqual({
      context: "cell",
      field: "ccy",
      filter: "",
      name: "Cell",
      rpcName: "CELL",
    });
  });

  describe("VIEW_PORT_MENUS_SELECT_RPC", () => {
    test("invokes the handler with the viewport's current selection", async () => {
      const { call, server, service, vpId } = await setup();
      server.viewPortContainer.selectRow(
        { sessionId: "session-1", channelId: "channel-1" },
        vpId,
        "o1",
        false,
      );
      server.viewPortContainer.selectRow(
        { sessionId: "session-1", channelId: "channel-1" },
        vpId,
        "o3",
        true,
      );

      expect(await call(select(vpId, "SELECT"))).toEqual(
        success(vpId, "SELECT", notification("SELECT")),
      );
      const [selection, sessionId, session] = service.calls[0].args as [
        ViewPortSelection,
        string,
        MenuRpcSession,
      ];
      expect([...selection.rowKeys].sort()).toEqual(["o1", "o3"]);
      expect(selection.viewPort.id).toBe(vpId);
      expect(sessionId).toBe("session-1");
      expect(session).toMatchObject({
        sessionId: "session-1",
        channelId: "channel-1",
        requestId: "menu-1",
        user: { name: "steve" },
      });
      expect(session.viewport.id).toBe(vpId);
    });

    test("supports legacy (selection, sessionId) handlers", async () => {
      const { call, service, vpId } = await setup();
      expect(await call(select(vpId, "LEGACY_SELECT"))).toEqual(
        success(vpId, "LEGACY_SELECT", { type: "NO_ACTION" }),
      );
      expect(service.calls[0].args[1]).toBe("session-1");
    });

    test("rejects an unknown rpcName", async () => {
      restore = silence();
      const { call, vpId } = await setup();
      expect(await call(select(vpId, "NOPE"))).toEqual(
        reject(vpId, "NOPE", `no menu item NOPE on viewport ${vpId}`),
      );
    });

    test("rejects an item of another context", async () => {
      restore = silence();
      const { call, service, vpId } = await setup();
      expect(await call(select(vpId, "TABLE"))).toEqual(
        reject(
          vpId,
          "TABLE",
          "menu item TABLE has context grid, cannot be invoked by VIEW_PORT_MENUS_SELECT_RPC",
        ),
      );
      expect(service.calls).toHaveLength(0);
    });
  });

  describe("VIEW_PORT_MENU_TABLE_RPC", () => {
    test("invokes the handler with the session", async () => {
      const { call, service, vpId } = await setup();
      expect(await call(grid(vpId, "TABLE"))).toEqual(
        success(vpId, "TABLE", notification("TABLE")),
      );
      expect(service.calls[0].args).toHaveLength(1);
      expect(service.calls[0].args[0]).toMatchObject({ sessionId: "session-1" });
    });

    test("awaits an async handler", async () => {
      const { call, vpId } = await setup();
      expect(await call(grid(vpId, "ASYNC"))).toEqual(
        success(vpId, "ASYNC", {
          type: "OPEN_DIALOG_ACTION",
          table: { module: MODULE, table: "orders" },
          renderComponent: "grid",
        }),
      );
    });

    test("lets the handler check the user's authorizations", async () => {
      const { call, vpId } = await setup();
      expect(
        (await call(grid(vpId, "ADMIN_ONLY"), requestContext("menu-1"))) ?.body,
      ).toMatchObject({ action: { message: "not permitted" } });
      expect(
        (
          await call(
            grid(vpId, "ADMIN_ONLY"),
            requestContext("menu-1", "session-1", ["admin"]),
          )
        )?.body,
      ).toMatchObject({ action: { message: "done" } });
    });

    test("rejects an unknown rpcName and an item of another context", async () => {
      restore = silence();
      const { call, vpId } = await setup();
      expect((await call(grid(vpId, "NOPE")))?.body.type).toBe(
        "VIEW_PORT_MENU_REJ",
      );
      expect(await call(grid(vpId, "ROW"))).toEqual(
        reject(
          vpId,
          "ROW",
          "menu item ROW has context row, cannot be invoked by VIEW_PORT_MENU_TABLE_RPC",
        ),
      );
    });
  });

  describe("VIEW_PORT_MENU_ROW_RPC", () => {
    test("invokes the handler with rowKey, client row and session", async () => {
      const { call, service, vpId } = await setup();
      expect(await call(row(vpId, "ROW"))).toEqual(
        success(vpId, "ROW", notification("ROW")),
      );
      const [rowKey, rowDto, session] = service.calls[0].args;
      expect(rowKey).toBe("o2");
      expect(rowDto).toEqual({ id: "o2", ccy: "GBP", qty: 200 });
      expect(session).toMatchObject({ sessionId: "session-1" });
    });

    test("rejects with a generic error when the handler throws", async () => {
      restore = silence();
      const { call, vpId } = await setup();
      expect(await call(row(vpId, "THROWS"))).toEqual(
        reject(vpId, "THROWS", "Failed to process request menu-1"),
      );
    });

    test("rejects an unknown rpcName and an item of another context", async () => {
      restore = silence();
      const { call, vpId } = await setup();
      expect((await call(row(vpId, "NOPE")))?.body.type).toBe(
        "VIEW_PORT_MENU_REJ",
      );
      expect((await call(row(vpId, "CELL")))?.body).toMatchObject({
        type: "VIEW_PORT_MENU_REJ",
        error: expect.stringContaining("has context cell"),
      });
    });
  });

  describe("VIEW_PORT_MENU_CELL_RPC", () => {
    test("invokes the handler with rowKey, field, value and session", async () => {
      const { call, service, vpId } = await setup();
      expect(await call(cell(vpId, "CELL"))).toEqual(
        success(vpId, "CELL", notification("CELL")),
      );
      const [rowKey, field, value, session] = service.calls[0].args;
      expect([rowKey, field, value]).toEqual(["o3", "ccy", "EUR"]);
      expect(session).toMatchObject({ sessionId: "session-1" });
    });

    test("rejects with a generic error when an async handler rejects", async () => {
      restore = silence();
      const { call, vpId } = await setup();
      expect(await call(cell(vpId, "ASYNC_THROWS"))).toEqual(
        reject(vpId, "ASYNC_THROWS", "Failed to process request menu-1"),
      );
    });

    test("rejects an unknown rpcName and an item of another context", async () => {
      restore = silence();
      const { call, vpId } = await setup();
      expect((await call(cell(vpId, "NOPE")))?.body.type).toBe(
        "VIEW_PORT_MENU_REJ",
      );
      expect((await call(cell(vpId, "SELECT")))?.body).toMatchObject({
        type: "VIEW_PORT_MENU_REJ",
        error: expect.stringContaining("has context selected-rows"),
      });
    });
  });

  describe("viewport checks", () => {
    test("rejects an unknown viewport", async () => {
      restore = silence();
      const { call } = await setup();
      expect(await call(grid("missing-vp", "TABLE"))).toEqual(
        reject("missing-vp", "TABLE", "viewport missing-vp not found"),
      );
    });

    test("rejects a viewport owned by another session", async () => {
      restore = silence();
      const { call, service, vpId } = await setup();
      const response = await call(
        grid(vpId, "TABLE"),
        requestContext("menu-1", "session-2"),
      );
      expect(response?.body).toEqual({
        type: "VIEW_PORT_MENU_REJ",
        error: `viewport ${vpId} not found`,
        rpcName: "TABLE",
        vpId,
      });
      expect(service.calls).toHaveLength(0);
    });
  });
});

describe("menu RPC wire format", () => {
  test("responses and actions match @vuu-ui/vuu-protocol-types", () => {
    const resp: VuuRpcMenuSuccess = ViewPortMenuRpcResponse(
      "vp-1",
      "RPC",
      NoAction(),
    );
    const rej: VuuRpcMenuError = ViewPortMenuRpcReject("vp-1", "RPC", "bad");
    expect(resp).toEqual({
      type: "VIEW_PORT_MENU_RESP",
      action: { type: "NO_ACTION" },
      rpcName: "RPC",
      vpId: "vp-1",
    });
    expect(rej).toEqual({
      type: "VIEW_PORT_MENU_REJ",
      error: "bad",
      rpcName: "RPC",
      vpId: "vp-1",
    });

    const actions: VuuRpcMenuSuccess["action"][] = [
      NoAction(),
      ShowNotification("message"),
      ShowNotification("message", "title"),
      OpenDialog({ module: "M", table: "session:1" }),
      OpenDialog({ module: "M", table: "session:1" }, "inline-form"),
      CloseDialog(),
    ];
    expect(JSON.parse(JSON.stringify(actions))).toEqual([
      { type: "NO_ACTION" },
      { type: "SHOW_NOTIFICATION_ACTION", message: "message" },
      { type: "SHOW_NOTIFICATION_ACTION", message: "message", title: "title" },
      {
        type: "OPEN_DIALOG_ACTION",
        table: { module: "M", table: "session:1" },
        renderComponent: "grid",
      },
      {
        type: "OPEN_DIALOG_ACTION",
        table: { module: "M", table: "session:1" },
        renderComponent: "inline-form",
      },
      { type: "CLOSE_DIALOG_ACTION" },
    ]);
  });
});

describe("menu RPC over the websocket", () => {
  test("round trips the vuu-data-remote message shapes", async () => {
    const lifecycle = new LifecycleContainer();
    const loginTokenService = LoginTokenService();
    const token = loginTokenService.getToken(
      VuuUserWithAuthorizations("steve", []),
    );
    const services: MenuService[] = [];
    const server = new VuuServer(
      VuuServerConfig(
        VuuWebSocketOptions().withWsPort(0),
        {},
        loginTokenService,
      ).withModule(createModule(services)),
      lifecycle,
    );

    try {
      await lifecycle.start();
      const client = await connect(server.webSocketPort as number);
      try {
        const login = await client.request("login", { type: "LOGIN", token });
        expect(login.body.type).toBe("LOGIN_SUCCESS");
        const sessionId = login.sessionId;

        const created = await client.request(
          "create-vp",
          createVpRequest(),
          sessionId,
        );
        expect(created.body.type).toBe("CREATE_VP_SUCCESS");
        const vpId = created.body.viewPortId as string;

        // as sent by vuu-data-remote ServerProxy.menuRpcCall
        const rowResponse = await client.request(
          "menu-row",
          row(vpId, "ROW"),
          sessionId,
        );
        expect(rowResponse.body).toEqual({
          type: "VIEW_PORT_MENU_RESP",
          action: notification("ROW"),
          rpcName: "ROW",
          vpId,
        });

        const rejResponse = await client.request(
          "menu-rej",
          cell(vpId, "NOPE"),
          sessionId,
        );
        expect(rejResponse.body).toMatchObject({
          type: "VIEW_PORT_MENU_REJ",
          rpcName: "NOPE",
          vpId,
        });
      } finally {
        client.close();
      }
    } finally {
      await lifecycle.destroy();
    }
  });
});

type WireMessage = { requestId: string; sessionId: string; body: any };

function connect(port: number) {
  return new Promise<{
    close: () => void;
    request: (
      requestId: string,
      body: unknown,
      sessionId?: string,
    ) => Promise<WireMessage>;
  }>((resolve, reject) => {
    const socket = new WebSocket(`ws://localhost:${port}/websocket`);
    const pending = new Map<string, (message: WireMessage) => void>();
    socket.addEventListener("error", () => reject(Error("WebSocket failed")));
    socket.addEventListener("message", ({ data }) => {
      const messages = JSON.parse(String(data));
      for (const message of Array.isArray(messages) ? messages : [messages]) {
        const resolveRequest = pending.get(message.requestId);
        if (resolveRequest && message.body?.type !== "TABLE_ROW") {
          pending.delete(message.requestId);
          resolveRequest(message);
        }
      }
    });
    socket.addEventListener("open", () =>
      resolve({
        close: () => socket.close(),
        request: (requestId, body, sessionId = "") =>
          new Promise((resolveRequest) => {
            pending.set(requestId, resolveRequest);
            socket.send(
              JSON.stringify({ body, module: "CORE", requestId, sessionId }),
            );
          }),
      }),
    );
  });
}
