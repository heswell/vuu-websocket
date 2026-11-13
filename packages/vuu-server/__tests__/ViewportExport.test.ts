import { describe, expect, test } from "bun:test";
import type { VuuViewportCreateRequest } from "@vuu-ui/vuu-protocol-types";
import {
  Columns,
  createViewportExportHttpHandler,
  EXPORT_VIEWPORT_RPC,
  LifecycleContainer,
  LoginTokenService,
  ModuleFactory,
  NullProvider,
  RpcHandler,
  TableDef,
  ViewPortDef,
  VuuServer,
  VuuServerConfig,
  VuuUserWithAuthorizations,
  VuuWebSocketOptions,
} from "../src";
import { CoreServerApiHandler } from "../src/core/CoreServerApiHandler";
import type { DataTable } from "../src/core/table/InMemDataTable";
import type { ProviderContainer } from "../src/provider/ProviderContainer";
import { OutboundRowPublishQueue } from "../src/util/PublishQueue";

const MODULE = "EXPORT_TEST";

const createModule = () =>
  ModuleFactory.withNameSpace(MODULE)
    .addTable(
      TableDef({
        name: "trades",
        keyField: "id",
        columns: Columns.fromNames("id:string", "ric:string", "qty:int"),
      }),
      (table) => new NullProvider(table),
      (table) => ViewPortDef(table.tableDef.columns, new RpcHandler()),
    )
    .asModule();

const requestContext = (requestId: string, sessionId = "session-1") =>
  ({
    requestId,
    session: { sessionId, channelId: "channel-1" },
    user: VuuUserWithAuthorizations("steve", []),
    queue: new OutboundRowPublishQueue(),
  }) as any;

const setup = async (
  vp: Partial<VuuViewportCreateRequest> = {},
  rows = 10,
) => {
  const server = new VuuServer(
    VuuServerConfig(
      VuuWebSocketOptions().withWsPort(0),
      {},
      LoginTokenService(),
    ).withModule(createModule()),
    new LifecycleContainer(),
  );
  server.viewportExports.configure({ chunkRows: 3 });
  const trades = server.tableContainer.getTable<DataTable>("trades");
  for (let i = 0; i < rows; i++) {
    trades.insert([`t${i}`, i % 2 ? "AAA.L" : "BBB.L", i * 10]);
  }
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
      body: {
        type: "CREATE_VP",
        table: { module: MODULE, table: "trades" },
        aggregations: [],
        columns: ["id", "ric", "qty"],
        filterSpec: { filter: "" },
        groupBy: [],
        range: { from: 0, to: 5 },
        sort: { sortDefs: [] },
        ...vp,
      },
    } as any,
    requestContext("create"),
  );
  const vpId = (created?.body as { viewPortId: string }).viewPortId;
  const exportRpc = async (params: Record<string, unknown> = {}) => {
    const response = await api.process(
      {
        requestId: "rpc",
        sessionId: "session-1",
        module: "CORE",
        body: {
          type: "RPC_REQUEST",
          rpcName: EXPORT_VIEWPORT_RPC,
          params,
          context: { type: "VIEWPORT_CONTEXT", viewPortId: vpId },
        },
      } as any,
      requestContext("rpc"),
    );
    return (response?.body as any).result;
  };
  const handler = createViewportExportHttpHandler(
    () => server.viewportExports,
    { allowedOrigins: ["http://localhost:4000"] },
  );
  const fetchExport = async (path: string) => {
    const url = new URL(`http://localhost${path}`);
    return handler(
      new Request(url, { headers: { Origin: "http://localhost:4000" } }),
      url,
    );
  };
  return { exportRpc, fetchExport, server, trades };
};

const lines = async (response: Response) =>
  (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

describe("viewport export", () => {
  test("streams the viewport's sorted, filtered rows, not just its range", async () => {
    const { exportRpc, fetchExport } = await setup({
      filterSpec: { filter: 'ric = "AAA.L"' },
      sort: { sortDefs: [{ column: "qty", sortType: "D" }] },
    });
    const result = await exportRpc({ columns: ["qty", "id"] });
    expect(result.type).toBe("SUCCESS_RESULT");
    expect(result.data.rowCount).toBe(5);
    const response = (await fetchExport(result.data.path)) as Response;
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:4000",
    );
    expect(await lines(response)).toEqual([
      ["qty", "id"],
      [90, "t9"],
      [70, "t7"],
      [50, "t5"],
      [30, "t3"],
      [10, "t1"],
    ]);
  });

  test("is a point in time snapshot: later updates and deletes are not seen", async () => {
    const { exportRpc, fetchExport, server, trades } = await setup({}, 6);
    const { data } = await exportRpc();
    trades.update(trades.rowIndexAtKey("t0"), ["t0", "BBB.L", 999]);
    trades.delete("t1");
    trades.insert(["t99", "CCC.L", 1]);
    const rows = await lines((await fetchExport(data.path)) as Response);
    expect(rows.slice(1).map((r) => r[0])).toEqual([
      "t0",
      "t1",
      "t2",
      "t3",
      "t4",
      "t5",
    ]);
    expect(rows[1]).toEqual(["t0", "BBB.L", 0]);
    expect(server.viewportExports.size).toBe(0);
    expect(server.viewportExports.completed.at(-1)).toMatchObject({
      outcome: "complete",
      rowsSent: 6,
      chunks: 2,
    });
  });

  test("an export id can be fetched once", async () => {
    const { exportRpc, fetchExport } = await setup();
    const { data } = await exportRpc();
    await ((await fetchExport(data.path)) as Response).text();
    const again = (await fetchExport(data.path)) as Response;
    expect(again.status).toBe(404);
    const unknown = (await fetchExport("/api/export/nope")) as Response;
    expect(unknown.status).toBe(404);
  });

  test("cancelling the stream releases the snapshot", async () => {
    const { exportRpc, fetchExport, server } = await setup({}, 100);
    const { data } = await exportRpc();
    const response = (await fetchExport(data.path)) as Response;
    const reader = response.body!.getReader();
    await reader.read();
    await reader.read();
    await reader.cancel();
    expect(server.viewportExports.size).toBe(0);
    expect(server.viewportExports.completed.at(-1)?.outcome).toBe("cancelled");
  });

  test("rejects grouped viewports, unknown columns and too many exports", async () => {
    const grouped = await setup({ groupBy: ["ric"] });
    expect((await grouped.exportRpc()).type).toBe("ERROR_RESULT");

    const { exportRpc } = await setup();
    const bad = await exportRpc({ columns: ["id", "secret"] });
    expect(bad.type).toBe("ERROR_RESULT");
    expect(bad.errorMessage).toContain("secret");

    expect((await exportRpc()).type).toBe("SUCCESS_RESULT");
    expect((await exportRpc()).type).toBe("SUCCESS_RESULT");
    expect((await exportRpc()).errorMessage).toContain("too many exports");
  });
});
