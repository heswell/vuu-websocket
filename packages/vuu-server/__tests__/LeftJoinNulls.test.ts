// trader upstream issue 33: a LEFT JOIN row with no right-hand match has
// null (not 0) right-side columns, and the viewport sorts, filters, groups
// and aggregates over them without throwing.
import { describe, expect, test } from "bun:test";
import { Columns, TableDef, VuuUser } from "@heswell/vuu-server";
import { Join, JoinSpec, JoinTableDef, VisualLinks } from "../src/api/TableDef";
import type { ViewServerModule } from "../src/core/module/VsModule";
import { InMemDataTable } from "../src/core/table/InMemDataTable";
import { JoinTable } from "../src/core/table/JoinTable";
import { TableContainer } from "../src/core/table/TableContainer";
import { JoinTableProvider } from "../src/provider/JoinTableProvider";
import type { ProviderContainer } from "../src/provider/ProviderContainer";
import { OutboundRowPublishQueue } from "../src/util/PublishQueue";
import {
  flushViewports,
  isViewPortRowUpdate,
  type ViewPortUpdate,
} from "../src/viewport/Viewport";
import { ViewportContainer } from "../src/viewport/ViewportContainer";

const createTable = (name: string, keyField: string, ...columns: string[]) => {
  const tableDef = TableDef({
    name,
    keyField,
    columns: Columns.fromNames(...columns),
  });
  tableDef.setModule({ name: "TEST" } as ViewServerModule);
  return new InMemDataTable(tableDef, new JoinTableProvider());
};

const setup = () => {
  const instruments = createTable(
    "instruments",
    "ric",
    "ric:string",
    "exchange:string",
  );
  instruments.insert(["AAA.L", "XLON"]);
  instruments.insert(["BBB.L", "XLON"]);
  instruments.insert(["CCC.N", "XNYS"]);
  instruments.insert(["DDD.N", "XNYS"]);

  const prices = createTable(
    "prices",
    "ric",
    "ric:string",
    "bid:double",
    "bidSize:int",
    "phase:string",
  );
  prices.insert(["AAA.L", 10.5, 100, "C"]);
  prices.insert(["CCC.N", 0, 0, "C"]);

  const joinDef = JoinTableDef({
    name: "instrumentPrices",
    baseTable: instruments.tableDef,
    joinColumns: Columns.fromNames(
      "ric:string",
      "exchange:string",
      "bid:double",
      "bidSize:int",
      "phase:string",
    ),
    joins: Join(prices.tableDef, JoinSpec("ric", "ric", "LeftOuterJoin")),
    joinFields: [],
    links: VisualLinks(),
  });
  joinDef.setModule({ name: "TEST" } as ViewServerModule);
  const join = new JoinTable(joinDef, instruments, prices);

  const tableContainer = new TableContainer(new JoinTableProvider());
  const viewportContainer = new ViewportContainer(
    tableContainer,
    {} as ProviderContainer,
  );
  const queue = new OutboundRowPublishQueue();
  const session = { sessionId: "session-1", channelId: "channel-1" };

  const createViewport = (
    options: {
      aggregations?: { column: string; aggType: number }[];
      filter?: string;
      groupBy?: string[];
      sort?: { column: string; sortType: "A" | "D" }[];
    } = {},
  ) => {
    const vp = viewportContainer.create(
      "req-1",
      VuuUser("steve"),
      session,
      queue,
      join as unknown as InMemDataTable,
      {
        type: "CREATE_VP",
        table: joinDef.asVuuTable,
        aggregations: (options.aggregations ?? []) as never,
        columns: ["ric", "exchange", "bid", "bidSize", "phase"],
        filterSpec: { filter: options.filter ?? "" },
        groupBy: options.groupBy ?? [],
        range: { from: 0, to: 100 },
        sort: { sortDefs: options.sort ?? [] },
      },
    );
    vp.postDataForCurrentRange();
    return vp;
  };
  const drain = () => queue.popUpTo(1000) as ViewPortUpdate[];
  return { createViewport, drain, instruments, join, prices };
};

const keysOf = (vp: {
  getDataForCurrentRange(): { rows: { rowKey: string }[] };
}) => vp.getDataForCurrentRange().rows.map((r) => r.rowKey);

describe("LEFT JOIN without a right-hand match", () => {
  test("right-side columns are null in the table and on the wire", () => {
    const { createViewport, drain } = setup();
    createViewport({ sort: [{ column: "ric", sortType: "A" }] });
    const rows = drain()
      .filter(isViewPortRowUpdate)
      .map((u) => u.data);
    expect(rows).toEqual([
      ["AAA.L", "XLON", 10.5, 100, "C"],
      ["BBB.L", "XLON", null, null, null],
      ["CCC.N", "XNYS", 0, 0, "C"],
      ["DDD.N", "XNYS", null, null, null],
    ]);
    // JSON keeps null, so the client can tell "no price" from 0
    expect(JSON.parse(JSON.stringify(rows[1]))).toEqual([
      "BBB.L",
      "XLON",
      null,
      null,
      null,
    ]);
  });

  test("columns become null again when the right row is deleted", () => {
    const { createViewport, prices } = setup();
    const vp = createViewport({ sort: [{ column: "ric", sortType: "A" }] });
    prices.delete("AAA.L");
    flushViewports();
    expect(vp.getDataForCurrentRange().rows[0].data).toEqual([
      "AAA.L",
      "XLON",
      null,
      null,
      null,
    ]);
  });

  test("sorts nulls first ascending and last descending", () => {
    const { createViewport } = setup();
    expect(
      keysOf(
        createViewport({
          sort: [
            { column: "bid", sortType: "A" },
            { column: "ric", sortType: "A" },
          ],
        }),
      ),
    ).toEqual(["BBB.L", "DDD.N", "CCC.N", "AAA.L"]);
    expect(
      keysOf(
        createViewport({
          sort: [
            { column: "bid", sortType: "D" },
            { column: "ric", sortType: "A" },
          ],
        }),
      ),
    ).toEqual(["AAA.L", "CCC.N", "BBB.L", "DDD.N"]);
  });

  test.each([
    ["bid > 1", ["AAA.L"]],
    ["bid < 1", ["CCC.N"]],
    ["bid = 0", ["CCC.N"]],
    ["bidSize >= 0", ["AAA.L", "CCC.N"]],
    ['phase = "C"', ["AAA.L", "CCC.N"]],
    ['phase starts "C"', ["AAA.L", "CCC.N"]],
    ['phase in ["C"]', ["AAA.L", "CCC.N"]],
    ['phase != "C"', ["BBB.L", "DDD.N"]],
  ])(
    "filter %p excludes or includes nulls without throwing",
    (filter, expected) => {
      const { createViewport } = setup();
      expect(
        keysOf(
          createViewport({
            filter,
            sort: [{ column: "ric", sortType: "A" }],
          }),
        ),
      ).toEqual(expected);
    },
  );

  test("groups and aggregates over nulls", () => {
    const { createViewport } = setup();
    const vp = createViewport({
      // 1 sum, 2 avg, 3 count, 4 high, 5 low
      aggregations: [
        { column: "bid", aggType: 1 },
        { column: "bidSize", aggType: 3 },
      ],
      groupBy: ["exchange"],
      sort: [{ column: "exchange", sortType: "A" }],
    });
    const groups = vp.getDataForCurrentRange().rows.map((r) => r.data);
    expect(groups).toHaveLength(2);
    expect(JSON.stringify(groups)).not.toContain("NaN");
  });
});
