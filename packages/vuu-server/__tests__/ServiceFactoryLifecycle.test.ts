import { describe, expect, test } from "bun:test";
import type { VuuViewportCreateRequest } from "@vuu-ui/vuu-protocol-types";
import {
  Columns,
  DefaultRpcHandler,
  Join,
  JoinSpec,
  JoinTableDef,
  ModuleFactory,
  NullProvider,
  PermissionFilter,
  RpcHandler,
  RpcNames,
  TableDef,
  ViewPortDef,
  VisualLinks,
  VuuUser,
  type ServiceFactory,
} from "@heswell/vuu-server";
import { CoreServerApiHandler } from "../src/core/CoreServerApiHandler";
import { VuuServer } from "../src/core/VuuServer";
import {
  VuuServerConfig,
  VuuWebSocketOptions,
} from "../src/core/VuuServerOptions";
import { LoginTokenService } from "../src/net/auth/LoginTokenService";
import { LifecycleContainer } from "../src/toolbox/thread/LifecycleContainer";
import { OutboundRowPublishQueue } from "../src/util/PublishQueue";
import type { DataTable } from "../src/core/table/InMemDataTable";
import { InMemDataTable } from "../src/core/table/InMemDataTable";
import { JoinTable } from "../src/core/table/JoinTable";
import { TableContainer } from "../src/core/table/TableContainer";
import type { ViewServerModule } from "../src/core/module/VsModule";
import { JoinTableProvider } from "../src/provider/JoinTableProvider";
import type { ProviderContainer } from "../src/provider/ProviderContainer";
import { ViewportContainer } from "../src/viewport/ViewportContainer";

class TestRpcHandler extends RpcHandler {}

const createModule = (
  moduleName: string,
  joinServiceFactory: ServiceFactory,
) =>
  ModuleFactory.withNameSpace(moduleName)
    .addTable(
      TableDef({
        name: "orders",
        keyField: "id",
        columns: Columns.fromNames("id:string", "ccy:string"),
      }),
      (table) => new NullProvider(table),
      joinServiceFactory,
    )
    .addTable(
      TableDef({
        name: "currencies",
        keyField: "id",
        columns: Columns.fromNames("id:string", "name:string"),
      }),
      (table) => new NullProvider(table),
    )
    .addJoinTable(
      (tableDefs) =>
        JoinTableDef({
          name: "ordersCcy",
          baseTable: tableDefs.get(moduleName, "orders"),
          joinColumns: Columns.fromNames(
            "id:string",
            "ccy:string",
            "name:string",
          ),
          joins: Join(
            tableDefs.get(moduleName, "currencies"),
            JoinSpec("ccy", "id", "LeftOuterJoin"),
          ),
          links: VisualLinks(),
        }),
      joinServiceFactory,
    )
    .asModule();

const createRequest = (
  module: string,
  table: string,
  columns: string[],
): VuuViewportCreateRequest => ({
  type: "CREATE_VP",
  table: { module, table },
  aggregations: [],
  columns,
  filterSpec: { filter: "" },
  groupBy: [],
  range: { from: 0, to: 100 },
  sort: { sortDefs: [] },
});

const requestContext = (requestId: string) =>
  ({
    requestId,
    session: { sessionId: "session-1", channelId: "channel-1" },
    user: VuuUser("steve"),
    queue: new OutboundRowPublishQueue(),
  }) as any;

describe("ModuleFactory.addJoinTable serviceFactory", () => {
  test("registers the service factory under the realised join table name", () => {
    const serviceFactory: ServiceFactory = (table) =>
      ViewPortDef(table.tableDef.columns, new TestRpcHandler());
    const module = createModule("JOIN_SERVICE_REGISTRATION", serviceFactory);

    expect(module.viewPortDefs.get("ordersCcy")).toBe(serviceFactory);
  });
});

describe("ServiceFactory lifecycle", () => {
  const setup = (moduleName: string) => {
    const handlers: RpcHandler[] = [];
    const serviceFactory: ServiceFactory = (table) => {
      const handler = new TestRpcHandler();
      handlers.push(handler);
      return ViewPortDef(table.tableDef.columns, handler);
    };
    const server = new VuuServer(
      VuuServerConfig(
        VuuWebSocketOptions().withWsPort(0),
        {},
        LoginTokenService(),
      ).withModule(createModule(moduleName, serviceFactory)),
      new LifecycleContainer(),
    );
    const api = new CoreServerApiHandler(
      server.viewPortContainer,
      server.tableContainer,
      {} as ProviderContainer,
    );
    return { api, handlers, moduleName, server };
  };

  test("GET_TABLE_META reports table columns without invoking the factory", async () => {
    const { api, handlers, moduleName } = setup("META_NO_HANDLER");
    const getMeta = (table: string) =>
      api.process(
        {
          requestId: "meta-1",
          sessionId: "session-1",
          body: {
            type: "GET_TABLE_META",
            table: { module: moduleName, table },
          },
        } as any,
        requestContext("meta-1"),
      );

    const ordersMeta = await getMeta("orders");
    const response = await getMeta("ordersCcy");

    expect(handlers).toHaveLength(0);
    expect(ordersMeta?.body).toMatchObject({
      type: "TABLE_META_RESP",
      columns: ["id", "ccy"],
    });
    expect(response?.body).toMatchObject({
      type: "TABLE_META_RESP",
      columns: ["id", "ccy", "name"],
      dataTypes: ["string", "string", "string"],
      key: "id",
    });
  });

  test("CREATE_VP invokes the factory once per viewport, each viewport owns its handler", async () => {
    const { api, handlers, moduleName, server } = setup("PER_VIEWPORT");
    const createVp = (requestId: string) =>
      api.process(
        {
          requestId,
          sessionId: "session-1",
          body: createRequest(moduleName, "ordersCcy", ["id", "name"]),
        } as any,
        requestContext(requestId),
      );

    const first = await createVp("vp-1");
    const second = await createVp("vp-2");

    expect(handlers).toHaveLength(2);
    expect(handlers[0]).not.toBe(handlers[1]);
    const vpIds = [first, second].map(
      (response) => (response?.body as { viewPortId: string }).viewPortId,
    );
    const services = vpIds.map(
      (vpId) =>
        server.viewPortContainer.getViewportById(vpId)?.viewPortDef.service,
    );
    expect(services).toEqual(handlers);
  });
});

describe("DefaultRpcHandler typeahead registration", () => {
  const tableContainer = new TableContainer(new JoinTableProvider());

  test("typeahead is shared, not re-created, across handler instances", () => {
    const registrations: Array<[string, unknown]> = [];
    class RecordingHandler extends DefaultRpcHandler {
      registerRpc(name: string, func: Parameters<DefaultRpcHandler["registerRpc"]>[1]) {
        registrations.push([name, func]);
        super.registerRpc(name, func);
      }
    }
    new RecordingHandler(tableContainer);
    new RecordingHandler(tableContainer);

    const typeaheadFuncs = registrations
      .filter(([name]) => name === RpcNames.UniqueFieldValuesRpc)
      .map(([, func]) => func);
    expect(typeaheadFuncs).toHaveLength(2);
    expect(typeaheadFuncs[0]).toBe(typeaheadFuncs[1]);
  });

  test("re-registering the same function is a no-op, a different function throws", () => {
    const handler = new DefaultRpcHandler(tableContainer);
    const rpc = () => ({ type: "SUCCESS_RESULT", data: undefined }) as const;

    handler.registerRpc("doThing", rpc);
    expect(() => handler.registerRpc("doThing", rpc)).not.toThrow();
    expect(() =>
      handler.registerRpc("doThing", () => ({
        type: "SUCCESS_RESULT",
        data: undefined,
      })),
    ).toThrow("doThing already registered");
  });
});

describe("JoinTableDef permissionFunction", () => {
  test("is passed through to the TableDef and filters join viewport rows", () => {
    const createTable = (name: string, ...columns: string[]) => {
      const tableDef = TableDef({
        name,
        keyField: "id",
        columns: Columns.fromNames(...columns),
      });
      tableDef.setModule({ name: "TEST" } as ViewServerModule);
      return new InMemDataTable(tableDef, new JoinTableProvider());
    };
    const orders = createTable("orders", "id:string", "ccy:string");
    orders.insert(["o1", "EUR"]);
    orders.insert(["o2", "GBP"]);
    orders.insert(["o3", "EUR"]);
    const currencies = createTable("currencies", "id:string", "name:string");
    currencies.insert(["EUR", "Euro"]);
    currencies.insert(["GBP", "Sterling"]);

    const joinDef = JoinTableDef({
      name: "ordersCcyPermissioned",
      baseTable: orders.tableDef,
      joinColumns: Columns.fromNames("id:string", "ccy:string", "name:string"),
      joins: Join(currencies.tableDef, JoinSpec("ccy", "id", "LeftOuterJoin")),
      links: VisualLinks(),
      permissionFunction: () => PermissionFilter("ccy", new Set(["EUR"])),
    });
    joinDef.setModule({ name: "TEST" } as ViewServerModule);
    expect(joinDef.permissionFunction).toBeFunction();

    const join = new JoinTable(joinDef, orders, currencies);
    const tableContainer = new TableContainer(new JoinTableProvider());
    const viewportContainer = new ViewportContainer(
      tableContainer,
      {} as ProviderContainer,
    );
    const vp = viewportContainer.create(
      "req-1",
      VuuUser("steve"),
      { sessionId: "session-1", channelId: "channel-1" },
      new OutboundRowPublishQueue(),
      join as unknown as DataTable,
      createRequest("TEST", "ordersCcyPermissioned", ["id", "name"]),
    );

    expect(vp.getDataForCurrentRange().rows.map((r) => r.data)).toEqual([
      ["o1", "Euro"],
      ["o3", "Euro"],
    ]);
  });
});
