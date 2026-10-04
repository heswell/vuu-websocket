import { describe, expect, test } from "bun:test";
import { Columns, TableDef, VuuUser } from "@heswell/vuu-server";
import { InMemDataTable } from "../src/core/table/InMemDataTable";
import { TableContainer } from "../src/core/table/TableContainer";
import type { ViewServerModule } from "../src/core/module/VsModule";
import { JoinTableProvider } from "../src/provider/JoinTableProvider";
import type { ProviderContainer } from "../src/provider/ProviderContainer";
import { OutboundRowPublishQueue } from "../src/util/PublishQueue";
import {
  flushViewports,
  isViewPortRowUpdate,
  type ViewPortUpdate,
} from "../src/viewport/Viewport";
import { ViewportContainer } from "../src/viewport/ViewportContainer";

const createTable = (name: string, ...columns: string[]) => {
  const tableDef = TableDef({
    name,
    keyField: "id",
    columns: Columns.fromNames(...columns),
  });
  tableDef.setModule({ name: "TEST" } as ViewServerModule);
  return new InMemDataTable(tableDef, new JoinTableProvider());
};

const setup = () => {
  const orders = createTable(
    "orders",
    "id:string",
    "ccy:string",
    "price:double",
    "qty:int",
  );
  orders.insert(["o1", "EUR", 10, 100]);
  orders.insert(["o2", "GBP", 20, 200]);
  orders.insert(["o3", "EUR", 30, 300]);
  orders.insert(["o4", "USD", 40, 400]);

  const currencies = createTable("currencies", "id:string", "name:string");
  currencies.insert(["EUR", "Euro"]);
  currencies.insert(["GBP", "Sterling"]);
  currencies.insert(["USD", "Dollar"]);

  const tableContainer = new TableContainer(new JoinTableProvider());
  tableContainer.addTable(orders);
  tableContainer.addTable(currencies);
  const viewportContainer = new ViewportContainer(
    tableContainer,
    {} as ProviderContainer,
  );
  const queue = new OutboundRowPublishQueue();
  const session = { sessionId: "session-1", channelId: "channel-1" };

  const createViewport = (
    table: InMemDataTable,
    columns: string[],
    options: { groupBy?: string[]; sort?: string } = {},
  ) => {
    const vp = viewportContainer.create(
      "req-1",
      VuuUser("steve"),
      session,
      queue,
      table,
      {
        type: "CREATE_VP",
        table: table.tableDef.asVuuTable,
        aggregations: [],
        columns,
        filterSpec: { filter: "" },
        groupBy: options.groupBy ?? [],
        range: { from: 0, to: 100 },
        sort: {
          sortDefs: options.sort
            ? [{ column: options.sort, sortType: "A" }]
            : [],
        },
      },
    );
    vp.postDataForCurrentRange();
    return vp;
  };

  const drain = () => queue.popUpTo(1000) as ViewPortUpdate[];
  const rowUpdates = () =>
    drain()
      .filter(isViewPortRowUpdate)
      .map(({ index, row }) => [index, row.rowKey, row.sel, row.data]);

  return {
    createViewport,
    currencies,
    drain,
    orders,
    queue,
    rowUpdates,
    viewportContainer,
  };
};

describe("Viewport (server)", () => {
  test("initial size and rows are published, with materialized data", () => {
    const { createViewport, orders, drain } = setup();
    const vp = createViewport(orders, ["id", "price"], { sort: "price" });
    const updates = drain();
    expect(updates[0].vpUpdate).toBe("SIZE");
    expect(updates[0].size).toBe(4);
    expect(updates.filter(isViewPortRowUpdate).map((u) => u.row.data)).toEqual([
      ["o1", 10],
      ["o2", 20],
      ["o3", 30],
      ["o4", 40],
    ]);
    expect(vp.size).toBe(4);
  });

  test("table updates are coalesced and published on flush", () => {
    const { createViewport, orders, drain, rowUpdates } = setup();
    createViewport(orders, ["id", "price"], { sort: "price" });
    drain();
    orders.upsert(["o1", "EUR", 50, 100]);
    orders.upsert(["o1", "EUR", 55, 100]);
    expect(drain()).toHaveLength(0);
    flushViewports();
    // o1 moved from first to last, every row in the window has shifted
    expect(rowUpdates()).toEqual([
      [0, "o2", 0, ["o2", 20]],
      [1, "o3", 0, ["o3", 30]],
      [2, "o4", 0, ["o4", 40]],
      [3, "o1", 0, ["o1", 55]],
    ]);
  });

  test("insert and delete publish size changes", () => {
    const { createViewport, orders, drain } = setup();
    createViewport(orders, ["id"]);
    drain();
    orders.insert(["o5", "CHF", 5, 500]);
    orders.insert(["o6", "CHF", 6, 600]);
    orders.delete("o2");
    flushViewports();
    const updates = drain();
    expect(updates[0].vpUpdate).toBe("SIZE");
    expect(updates[0].size).toBe(5);
    // net zero change in size, no size message
    orders.delete("o6");
    orders.insert(["o7", "CHF", 7, 700]);
    flushViewports();
    expect(drain().some((u) => u.vpUpdate === "SIZE")).toBe(false);
  });

  test("grouping, open tree node", () => {
    const { createViewport, orders, drain, rowUpdates, viewportContainer } =
      setup();
    const vp = createViewport(orders, ["ccy", "qty"]);
    drain();
    vp.changeViewport({
      groupBy: ["ccy"],
      aggregations: [{ column: "qty", aggType: 1 }],
    });
    expect(vp.size).toBe(3);
    drain();
    viewportContainer.openTreeNode(vp.id, "$root|EUR");
    expect(vp.size).toBe(5);
    expect(rowUpdates()).toEqual([
      [0, "$root|EUR", 0, [1, true, "$root|EUR", false, "EUR", 2, "EUR", 400]],
      [
        1,
        "$root|EUR|o1",
        0,
        [2, false, "$root|EUR|o1", true, "o1", 0, "EUR", 100],
      ],
      [
        2,
        "$root|EUR|o3",
        0,
        [2, false, "$root|EUR|o3", true, "o3", 0, "EUR", 300],
      ],
      [3, "$root|GBP", 0, [1, false, "$root|GBP", false, "GBP", 1, "GBP", 200]],
      [4, "$root|USD", 0, [1, false, "$root|USD", false, "USD", 1, "USD", 400]],
    ]);
    // selecting a group selects its leaf rows, for rpc handlers
    vp.selectRow("$root|EUR", false);
    expect(Array.from(vp.selectedKeys).sort()).toEqual(["o1", "o3"]);
  });

  test("visual link restricts child to rows matching parent selection", () => {
    const { createViewport, currencies, orders, viewportContainer } = setup();
    const parent = createViewport(currencies, ["id", "name"]);
    const child = createViewport(orders, ["id", "ccy"]);
    viewportContainer.linkViewPorts(child.id, parent.id, "ccy", "id");
    // no parent selection, child unrestricted
    expect(child.size).toBe(4);

    viewportContainer.selectRow(
      { sessionId: "session-1", channelId: "channel-1" },
      parent.id,
      "EUR",
      false,
    );
    expect(child.size).toBe(2);
    expect(child.getDataForCurrentRange().rows.map((r) => r.rowKey)).toEqual([
      "o1",
      "o3",
    ]);

    parent.selectRow("USD", true);
    expect(child.size).toBe(3);

    // link filter is independent of client filter
    child.changeViewport({ filterSpec: { filter: "qty > 150" } });
    expect(child.size).toBe(2);

    // new rows matching the link are admitted
    orders.insert(["o5", "USD", 50, 500]);
    flushViewports();
    expect(child.size).toBe(3);

    viewportContainer.unlinkViewPorts(child.id);
    expect(child.size).toBe(4);
  });

  test("removing parent viewport removes visual link", () => {
    const { createViewport, currencies, orders, viewportContainer } = setup();
    const parent = createViewport(currencies, ["id"]);
    const child = createViewport(orders, ["id", "ccy"]);
    viewportContainer.linkViewPorts(child.id, parent.id, "ccy", "id");
    parent.selectRow("GBP", false);
    expect(child.size).toBe(1);
    viewportContainer.removeViewport(parent.id);
    expect(child.size).toBe(4);
    expect(child.visualLink).toBeUndefined();
  });

  test("disabled viewport publishes nothing, resends on enable", () => {
    const { createViewport, orders, drain, rowUpdates } = setup();
    const vp = createViewport(orders, ["id", "qty"]);
    drain();
    vp.enabled = false;
    orders.upsert(["o1", "EUR", 10, 999]);
    flushViewports();
    expect(drain()).toHaveLength(0);
    vp.enabled = true;
    expect(rowUpdates()[0]).toEqual([0, "o1", 0, ["o1", 999]]);
  });

  test("typeahead values respect viewport filter", () => {
    const { createViewport, orders } = setup();
    const vp = createViewport(orders, ["id", "ccy"]);
    vp.changeViewport({ filterSpec: { filter: "qty > 150" } });
    expect(vp.getUniqueValues("ccy")).toEqual(["EUR", "GBP", "USD"]);
    expect(vp.getUniqueValues("ccy", "e")).toEqual(["EUR"]);
    vp.changeViewport({ filterSpec: { filter: "qty > 350" } });
    expect(vp.getUniqueValues("ccy")).toEqual(["USD"]);
  });
});

describe("JoinTable (server)", () => {
  test("viewport over a join table ticks with the right table", async () => {
    const { JoinTable } = await import("../src/core/table/JoinTable");
    const { JoinTableDef, Join, JoinSpec, VisualLinks } =
      await import("../src/api/TableDef");
    const { orders, currencies, createViewport, drain, rowUpdates } = setup();
    const joinDef = JoinTableDef({
      name: "ordersCcy",
      baseTable: orders.tableDef,
      joinColumns: Columns.fromNames(
        "id:string",
        "ccy:string",
        "qty:int",
        "name:string",
      ),
      joins: Join(currencies.tableDef, JoinSpec("ccy", "id", "LeftOuterJoin")),
      joinFields: [],
      links: VisualLinks(),
    });
    joinDef.setModule({ name: "TEST" } as ViewServerModule);
    const join = new JoinTable(joinDef, orders, currencies);
    const vp = createViewport(
      join as unknown as InMemDataTable,
      ["id", "name"],
      {},
    );
    expect(vp.getDataForCurrentRange().rows.map((r) => r.data)).toEqual([
      ["o1", "Euro"],
      ["o2", "Sterling"],
      ["o3", "Euro"],
      ["o4", "Dollar"],
    ]);
    drain();
    currencies.upsert(["EUR", "Euro (EUR)"]);
    flushViewports();
    expect(rowUpdates().map(([, key, , data]) => [key, data])).toEqual([
      ["o1", ["o1", "Euro (EUR)"]],
      ["o3", ["o3", "Euro (EUR)"]],
    ]);
  });
});
