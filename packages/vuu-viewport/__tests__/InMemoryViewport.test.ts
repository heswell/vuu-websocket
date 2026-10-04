import { describe, expect, test } from "bun:test";
import { Table, type TableSchema, type VuuDataRow } from "@heswell/vuu-table";
import type { VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import {
  InMemoryViewport,
  type ViewportBatch,
  type ViewportConfig,
} from "../src/index.ts";

const schema: TableSchema = {
  table: { module: "TEST", table: "orders" },
  key: "id",
  columns: [
    { name: "id", serverDataType: "string" },
    { name: "ccy", serverDataType: "string" },
    { name: "exchange", serverDataType: "string" },
    { name: "price", serverDataType: "double" },
    { name: "qty", serverDataType: "int" },
  ],
};

const CCY = ["EUR", "GBP", "USD", "JPY"];
const EXCHANGE = ["XLON", "XNYS", "XPAR"];

const makeRow = (i: number, rnd = Math.random): VuuDataRow => [
  `id-${i}`,
  CCY[Math.floor(rnd() * CCY.length)],
  EXCHANGE[Math.floor(rnd() * EXCHANGE.length)],
  Math.round(rnd() * 1000) / 10,
  Math.floor(rnd() * 100),
];

/** deterministic pseudo random */
const seededRandom = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const createTable = (count: number, rnd = seededRandom(1)) => {
  const table = new Table(schema);
  for (let i = 0; i < count; i++) table.insert(makeRow(i, rnd));
  return table;
};

/** Accumulates batches, as a client would */
class ClientModel {
  rows = new Map<
    number,
    { key: string; data: VuuRowDataItemType[]; sel: number }
  >();
  size = 0;
  apply({ size, rows }: ViewportBatch) {
    this.size = size;
    for (const row of rows) {
      this.rows.set(row.rowIndex, {
        key: row.rowKey,
        data: row.data,
        sel: row.sel,
      });
    }
    for (const idx of this.rows.keys()) if (idx >= size) this.rows.delete(idx);
    return this;
  }
  window(from: number, to: number) {
    const result = [];
    for (let i = from; i < Math.min(to, this.size); i++) {
      result.push(this.rows.get(i)?.data);
    }
    return result;
  }
}

const config = (
  overrides: Partial<ViewportConfig> = {},
): Partial<ViewportConfig> => ({
  columns: ["id", "ccy", "price"],
  ...overrides,
});

describe("InMemoryViewport flat", () => {
  test("initial window, natural order", () => {
    const table = createTable(100);
    const vp = new InMemoryViewport(table, {
      id: "vp1",
      ...config(),
      range: { from: 0, to: 10 },
    });
    const batch = vp.getCurrentRange();
    expect(batch.size).toBe(100);
    expect(batch.sizeChanged).toBe(true);
    expect(batch.rows.length).toBe(10);
    expect(batch.rows[0].rowKey).toBe("id-0");
    expect(batch.rows[0].data.length).toBe(3);
  });

  test("setRange returns only new rows", () => {
    const table = createTable(100);
    const vp = new InMemoryViewport(table, {
      id: "vp1",
      ...config(),
      range: { from: 0, to: 10 },
    });
    vp.getCurrentRange();
    const batch = vp.setRange({ from: 5, to: 15 });
    expect(batch.rows.map((r) => r.rowIndex)).toEqual([10, 11, 12, 13, 14]);
  });

  test("sort and filter", () => {
    const table = createTable(500);
    const vp = new InMemoryViewport(table, {
      id: "vp1",
      ...config({
        sort: { sortDefs: [{ column: "price", sortType: "D" }] },
        filterSpec: { filter: 'ccy = "EUR"' },
      }),
      range: { from: 0, to: 20 },
    });
    const { rows, size } = vp.getCurrentRange();
    const expected = table.rows.filter((r) => r[1] === "EUR");
    expect(size).toBe(expected.length);
    const prices = rows.map((r) => r.data[2] as number);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
    expect(rows.every((r) => r.data[1] === "EUR")).toBe(true);
  });

  test("tick outside range is not sent, tick inside range is", () => {
    const table = createTable(100);
    let pending = 0;
    const vp = new InMemoryViewport(table, {
      id: "vp1",
      ...config(),
      range: { from: 0, to: 10 },
      onPendingChanges: () => pending++,
    });
    vp.getCurrentRange();
    table.updateByKey("id-50", { price: 1 });
    expect(pending).toBe(0);
    table.updateByKey("id-5", { price: 1 });
    expect(pending).toBe(1);
    table.updateByKey("id-6", { price: 1 });
    expect(pending).toBe(1);
    const batch = vp.flush();
    expect(batch.rows.map((r) => r.rowKey)).toEqual(["id-5", "id-6"]);
    expect(batch.sizeChanged).toBe(false);
  });

  test("selection", () => {
    const table = createTable(20);
    const vp = new InMemoryViewport(table, {
      id: "vp1",
      ...config(),
      range: { from: 0, to: 10 },
    });
    vp.getCurrentRange();
    let batch = vp.selectRow("id-2", false);
    expect(batch.rows).toHaveLength(1);
    expect(batch.rows[0].sel).toBe(1);
    batch = vp.selectRow("id-3", false);
    expect(batch.rows.map((r) => [r.rowKey, r.sel])).toEqual([
      ["id-2", 0],
      ["id-3", 1],
    ]);
    batch = vp.selectRowRange("id-5", "id-7", true);
    expect(Array.from(vp.selectedKeys).sort()).toEqual([
      "id-3",
      "id-5",
      "id-6",
      "id-7",
    ]);
    batch = vp.deselectAll();
    expect(batch.rows).toHaveLength(4);
    expect(vp.selectedKeys.size).toBe(0);
  });

  test("permission and link filters compose with client filter", () => {
    const table = createTable(300);
    const vp = new InMemoryViewport(table, {
      id: "vp1",
      ...config({ filterSpec: { filter: "price > 20" } }),
      range: { from: 0, to: 300 },
      permissionFilter: (row) => row[2] === "XLON",
    });
    let { size } = vp.getCurrentRange();
    expect(size).toBe(
      table.rows.filter((r) => r[2] === "XLON" && (r[3] as number) > 20).length,
    );
    vp.setLinkFilter({ column: "ccy", values: new Set(["GBP", "USD"]) });
    size = vp.size;
    expect(size).toBe(
      table.rows.filter(
        (r) =>
          r[2] === "XLON" &&
          (r[3] as number) > 20 &&
          (r[1] === "GBP" || r[1] === "USD"),
      ).length,
    );
    vp.setLinkFilter(undefined);
    vp.setPermissionFilter(undefined);
    expect(vp.size).toBe(
      table.rows.filter((r) => (r[3] as number) > 20).length,
    );
  });

  test("base filter composes with client, link and permission filters", () => {
    const table = createTable(300);
    const vp = new InMemoryViewport(table, {
      id: "vp1",
      ...config({ filterSpec: { filter: "price > 20" } }),
      range: { from: 0, to: 300 },
      baseFilterSpec: { filter: "qty < 50" },
      permissionFilter: (row) => row[2] !== "XPAR",
    });
    const count = (fn: (r: VuuDataRow) => boolean) =>
      table.rows.filter(
        (r) =>
          r[2] !== "XPAR" &&
          (r[4] as number) < 50 &&
          (r[3] as number) > 20 &&
          fn(r),
      ).length;
    expect(vp.getCurrentRange().size).toBe(count(() => true));
    expect(vp.baseFilterSpec).toEqual({ filter: "qty < 50" });

    // changing the client filter does not remove the base filter
    vp.setConfig({ filterSpec: { filter: 'ccy = "EUR"' } });
    expect(vp.size).toBe(
      table.rows.filter(
        (r) => r[2] !== "XPAR" && (r[4] as number) < 50 && r[1] === "EUR",
      ).length,
    );
    vp.setConfig({ filterSpec: { filter: "price > 20" } });

    // all four slots together
    vp.setLinkFilter({ column: "ccy", values: new Set(["GBP"]) });
    expect(vp.size).toBe(count((r) => r[1] === "GBP"));

    // changing the base filter does not remove link or client filters
    vp.setBaseFilter({ filter: "qty > 49" });
    expect(vp.size).toBe(
      table.rows.filter(
        (r) =>
          r[2] !== "XPAR" &&
          (r[4] as number) >= 50 &&
          (r[3] as number) > 20 &&
          r[1] === "GBP",
      ).length,
    );

    vp.setLinkFilter(undefined);
    vp.setPermissionFilter(undefined);
    vp.setBaseFilter(undefined);
    expect(vp.baseFilterSpec).toEqual({ filter: "" });
    expect(vp.size).toBe(
      table.rows.filter((r) => (r[3] as number) > 20).length,
    );
  });

  test("base filter: narrowing keeps sort, applies to live updates and groups", () => {
    const table = createTable(400);
    const vp = new InMemoryViewport(table, {
      id: "vp1",
      ...config({
        columns: ["id", "ccy", "price", "qty"],
        sort: { sortDefs: [{ column: "price", sortType: "D" }] },
      }),
      range: { from: 0, to: 400 },
      baseFilterSpec: { filter: "qty < 80" },
    });
    const client = new ClientModel().apply(vp.getCurrentRange());

    // narrowing (old AND new) path
    client.apply(vp.setBaseFilter({ filter: 'qty < 80 and ccy = "EUR"' }));
    const expected = table.rows
      .filter((r) => (r[4] as number) < 80 && r[1] === "EUR")
      .sort((a, b) => (b[3] as number) - (a[3] as number))
      .map((r) => r[0]);
    expect(client.size).toBe(expected.length);
    expect(client.window(0, client.size).map((d) => d?.[0])).toEqual(expected);

    // live updates are filtered by the base filter
    const outKey = expected[0] as string;
    table.updateByKey(outKey, { qty: 99 });
    client.apply(vp.flush());
    expect(client.size).toBe(expected.length - 1);
    table.updateByKey(outKey, { qty: 1 });
    table.insert(["id-new", "GBP", 1, 1]);
    client.apply(vp.flush());
    expect(client.size).toBe(expected.length);

    // freeze-style base filter survives grouping
    vp.setConfig({ groupBy: ["ccy"] });
    expect(vp.size).toBe(1);
    vp.setBaseFilter(undefined);
    expect(vp.size).toBe(4);
  });

  test("invalid base filter rejects all rows", () => {
    const table = createTable(20);
    const vp = new InMemoryViewport(table, {
      id: "vp1",
      ...config(),
      range: { from: 0, to: 20 },
    });
    expect(vp.getCurrentRange().size).toBe(20);
    vp.setBaseFilter({ filter: "qty <<< 3" });
    expect(vp.size).toBe(0);
  });

  test("narrowing filter keeps sort", () => {
    const table = createTable(300);
    const vp = new InMemoryViewport(table, {
      id: "vp1",
      ...config({
        sort: { sortDefs: [{ column: "price", sortType: "A" }] },
        filterSpec: { filter: 'ccy = "EUR"' },
      }),
      range: { from: 0, to: 300 },
    });
    vp.getCurrentRange();
    vp.setConfig({
      filterSpec: { filter: 'ccy = "EUR" and exchange = "XLON"' },
    });
    const indices = Array.from(vp.rowIndices);
    const expected = table.rows
      .map((r, i) => [r, i] as const)
      .filter(([r]) => r[1] === "EUR" && r[2] === "XLON")
      .sort(
        ([r1, i1], [r2, i2]) =>
          (r1[3] as number) - (r2[3] as number) ||
          table.seqAt(i1) - table.seqAt(i2),
      )
      .map(([, i]) => i);
    expect(indices).toEqual(expected);
  });

  test("unique values for typeahead respect filter", () => {
    const table = createTable(300);
    const vp = new InMemoryViewport(table, {
      id: "vp1",
      ...config({ filterSpec: { filter: 'exchange = "XLON"' } }),
      range: { from: 0, to: 10 },
    });
    expect(vp.getUniqueValues("ccy")).toEqual(["EUR", "GBP", "JPY", "USD"]);
    expect(vp.getUniqueValues("ccy", "g")).toEqual(["GBP"]);
  });
});

describe("InMemoryViewport randomized consistency", () => {
  const scenarios: [string, Partial<ViewportConfig>][] = [
    ["natural order", {}],
    ["sorted", { sort: { sortDefs: [{ column: "price", sortType: "A" }] } }],
    [
      "multi sort",
      {
        sort: {
          sortDefs: [
            { column: "ccy", sortType: "D" },
            { column: "qty", sortType: "A" },
          ],
        },
      },
    ],
    ["filtered", { filterSpec: { filter: "price > 50" } }],
    [
      "sorted + filtered",
      {
        sort: { sortDefs: [{ column: "qty", sortType: "D" }] },
        filterSpec: { filter: 'ccy in ["EUR","GBP"]' },
      },
    ],
  ];

  for (const [name, scenario] of scenarios) {
    test(name, () => {
      const rnd = seededRandom(42);
      const table = createTable(400, rnd);
      const range = { from: 20, to: 60 };
      const vp = new InMemoryViewport(table, {
        id: "vp",
        columns: ["id", "ccy", "exchange", "price", "qty"],
        ...scenario,
        range,
      });
      const client = new ClientModel().apply(vp.getCurrentRange());
      const predicate = (row: VuuDataRow) =>
        scenario.filterSpec?.filter === "price > 50"
          ? (row[3] as number) > 50
          : scenario.filterSpec
            ? row[1] === "EUR" || row[1] === "GBP"
            : true;
      const sortDefs = scenario.sort?.sortDefs ?? [];
      const colIdx: Record<string, number> = {
        ccy: 1,
        price: 3,
        qty: 4,
      };
      const expectedOrder = () =>
        table.rows
          .map((r, i) => [r, i] as const)
          .filter(([r]) => predicate(r))
          .sort(([r1, i1], [r2, i2]) => {
            for (const { column, sortType } of sortDefs) {
              const c = colIdx[column];
              const dir = sortType === "D" ? -1 : 1;
              if (r1[c] !== r2[c]) return (r1[c]! < r2[c]! ? -1 : 1) * dir;
            }
            return table.seqAt(i1) - table.seqAt(i2);
          })
          .map(([r]) => r);

      let nextId = 400;
      for (let round = 0; round < 60; round++) {
        const ops = round % 10 === 9 ? 400 : Math.floor(rnd() * 30);
        for (let o = 0; o < ops; o++) {
          const op = rnd();
          if (op < 0.2) {
            table.insert(makeRow(nextId++, rnd));
          } else if (op < 0.35 && table.rowCount > 0) {
            const row = table.rows[Math.floor(rnd() * table.rowCount)];
            table.delete(row[0] as string);
          } else if (table.rowCount > 0) {
            const row = table.rows[Math.floor(rnd() * table.rowCount)];
            const newRow = makeRow(0, rnd);
            newRow[0] = row[0];
            if (rnd() < 0.5) newRow[1] = row[1];
            table.upsert(newRow);
          }
        }
        if (rnd() < 0.2) {
          const from = Math.floor(rnd() * 100);
          client.apply(vp.setRange({ from, to: from + 40 }));
        }
        client.apply(vp.flush());
        const expected = expectedOrder();
        expect(vp.size).toBe(expected.length);
        const { from, to } = vp.range;
        expect(client.window(from, to)).toEqual(
          expected.slice(from, to).map((r) => r.slice()),
        );
      }
    });
  }
});

describe("InMemoryViewport grouped", () => {
  const groupTable = () => {
    const table = new Table(schema);
    table.insert(["1", "EUR", "XLON", 10, 1]);
    table.insert(["2", "GBP", "XLON", 20, 2]);
    table.insert(["3", "EUR", "XPAR", 30, 3]);
    table.insert(["4", "EUR", "XLON", 40, 4]);
    table.insert(["5", "USD", "XNYS", 50, 5]);
    return table;
  };

  test("single level group with aggregations", () => {
    const table = groupTable();
    const vp = new InMemoryViewport(table, {
      id: "vp",
      columns: ["id", "ccy", "price", "qty"],
      groupBy: ["ccy"],
      aggregations: [
        { column: "price", aggType: 1 },
        { column: "qty", aggType: 2 },
      ],
      range: { from: 0, to: 20 },
    });
    const { rows, size } = vp.getCurrentRange();
    expect(size).toBe(3);
    expect(rows.map((r) => r.data)).toEqual([
      [1, false, "$root|EUR", false, "EUR", 3, "", "EUR", 80, 8 / 3],
      [1, false, "$root|GBP", false, "GBP", 1, "", "GBP", 20, 2],
      [1, false, "$root|USD", false, "USD", 1, "", "USD", 50, 5],
    ]);
  });

  test("open and close nodes", () => {
    const table = groupTable();
    const vp = new InMemoryViewport(table, {
      id: "vp",
      columns: ["id", "price"],
      groupBy: ["ccy", "exchange"],
      aggregations: [{ column: "price", aggType: 1 }],
      range: { from: 0, to: 20 },
    });
    const client = new ClientModel().apply(vp.getCurrentRange());
    client.apply(vp.openTreeNode("$root|EUR"));
    expect(client.size).toBe(5);
    expect(client.window(0, 5).map((d) => d![2])).toEqual([
      "$root|EUR",
      "$root|EUR|XLON",
      "$root|EUR|XPAR",
      "$root|GBP",
      "$root|USD",
    ]);
    client.apply(vp.openTreeNode("$root|EUR|XLON"));
    expect(client.window(0, 7).map((d) => d![2])).toEqual([
      "$root|EUR",
      "$root|EUR|XLON",
      "$root|EUR|XLON|1",
      "$root|EUR|XLON|4",
      "$root|EUR|XPAR",
      "$root|GBP",
      "$root|USD",
    ]);
    // leaf row
    expect(client.window(2, 3)[0]).toEqual([
      3,
      false,
      "$root|EUR|XLON|1",
      true,
      "1",
      0,
      "1",
      10,
    ]);
    client.apply(vp.closeTreeNode("$root|EUR"));
    expect(client.size).toBe(3);
  });

  test("incremental aggregate update", () => {
    const table = groupTable();
    const vp = new InMemoryViewport(table, {
      id: "vp",
      columns: ["ccy", "price"],
      groupBy: ["ccy"],
      aggregations: [
        { column: "price", aggType: 1 },
        { column: "price", aggType: 4 },
      ],
      range: { from: 0, to: 20 },
    });
    const client = new ClientModel().apply(vp.getCurrentRange());
    table.updateByKey("3", { price: 35 });
    const batch = vp.flush();
    expect(batch.rows).toHaveLength(1);
    client.apply(batch);
    expect(client.window(0, 1)[0]!.slice(6)).toEqual(["EUR", 85]);
  });

  test("sort groups by aggregate, then insert causes rebuild", () => {
    const table = groupTable();
    const vp = new InMemoryViewport(table, {
      id: "vp",
      columns: ["ccy", "price"],
      groupBy: ["ccy"],
      aggregations: [{ column: "price", aggType: 1 }],
      sort: { sortDefs: [{ column: "price", sortType: "D" }] },
      range: { from: 0, to: 20 },
    });
    const client = new ClientModel().apply(vp.getCurrentRange());
    expect(client.window(0, 3).map((d) => d![4])).toEqual([
      "EUR",
      "USD",
      "GBP",
    ]);
    table.insert(["6", "GBP", "XLON", 100, 1]);
    client.apply(vp.flush());
    expect(client.window(0, 3).map((d) => d![4])).toEqual([
      "GBP",
      "EUR",
      "USD",
    ]);
    expect(client.window(0, 1)[0]![7]).toBe(120);
  });

  test("group then ungroup", () => {
    const table = groupTable();
    const vp = new InMemoryViewport(table, {
      id: "vp",
      columns: ["id", "ccy"],
      range: { from: 0, to: 20 },
    });
    vp.getCurrentRange();
    let batch = vp.setConfig({ groupBy: ["ccy"] });
    expect(batch.size).toBe(3);
    batch = vp.setConfig({ groupBy: [] });
    expect(batch.size).toBe(5);
    expect(batch.rows[0].data).toEqual(["1", "EUR"]);
  });

  test("selected group yields leaf keys for visual linking", () => {
    const table = groupTable();
    const vp = new InMemoryViewport(table, {
      id: "vp",
      columns: ["id", "ccy"],
      groupBy: ["ccy"],
      range: { from: 0, to: 20 },
    });
    vp.getCurrentRange();
    vp.selectRow("$root|EUR", false);
    expect(vp.getSelectedRowKeys().sort()).toEqual(["1", "3", "4"]);
    expect(vp.getSelectedValues("exchange")).toEqual(new Set(["XLON", "XPAR"]));
  });
});

describe("InMemoryViewport grouped randomized consistency", () => {
  const groupScenarios: [string, Partial<ViewportConfig>][] = [
    [
      "two level, sum/high/low/count/distinct",
      {
        groupBy: ["ccy", "exchange"],
        aggregations: [
          { column: "price", aggType: 1 },
          { column: "price", aggType: 4 },
          { column: "qty", aggType: 5 },
          { column: "qty", aggType: 3 },
          { column: "exchange", aggType: 6 },
        ],
      },
    ],
    [
      "grouped, sorted by aggregate, filtered",
      {
        groupBy: ["exchange"],
        aggregations: [{ column: "price", aggType: 2 }],
        sort: { sortDefs: [{ column: "price", sortType: "D" }] },
        filterSpec: { filter: "qty > 20" },
      },
    ],
  ];
  for (const [name, scenario] of groupScenarios) {
    test(name, () => {
      const rnd = seededRandom(7);
      const table = createTable(300, rnd);
      const columns = ["id", "ccy", "exchange", "price", "qty"];
      const vp = new InMemoryViewport(table, {
        id: "vp",
        columns,
        ...scenario,
        range: { from: 0, to: 400 },
      });
      const client = new ClientModel().apply(vp.getCurrentRange());
      for (const ccy of CCY) client.apply(vp.openTreeNode(`$root|${ccy}`));
      client.apply(vp.openTreeNode(`$root|XLON`));
      client.apply(vp.openTreeNode(`$root|EUR|XPAR`));
      let nextId = 300;
      for (let round = 0; round < 40; round++) {
        const ops = Math.floor(rnd() * 20);
        for (let o = 0; o < ops; o++) {
          const op = rnd();
          if (op < 0.2) table.insert(makeRow(nextId++, rnd));
          else if (op < 0.3 && table.rowCount > 0) {
            table.delete(
              table.rows[Math.floor(rnd() * table.rowCount)][0] as string,
            );
          } else if (table.rowCount > 0) {
            const row = table.rows[Math.floor(rnd() * table.rowCount)];
            const newRow = makeRow(0, rnd);
            newRow[0] = row[0];
            if (rnd() < 0.7) newRow[1] = row[1];
            if (rnd() < 0.7) newRow[2] = row[2];
            table.upsert(newRow);
          }
        }
        client.apply(vp.flush());
        const fresh = new InMemoryViewport(table, {
          id: "fresh",
          columns,
          ...scenario,
          range: { from: 0, to: 400 },
        });
        fresh.getCurrentRange();
        for (const ccy of CCY) fresh.openTreeNode(`$root|${ccy}`);
        fresh.openTreeNode(`$root|XLON`);
        fresh.openTreeNode(`$root|EUR|XPAR`);
        const expected = new ClientModel().apply(fresh.getCurrentRange());
        expect(client.size).toBe(expected.size);
        const actualRows = client.window(0, client.size);
        const expectedRows = expected.window(0, expected.size);
        for (let i = 0; i < actualRows.length; i++) {
          const a = actualRows[i]!.map((v) =>
            typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v,
          );
          const e = expectedRows[i]!.map((v) =>
            typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v,
          );
          expect(a).toEqual(e);
        }
        fresh.destroy();
      }
    });
  }
});

describe("InMemoryViewport select all", () => {
  const sorted = (keys: Iterable<string>) => Array.from(keys).sort();

  test("selects every row, including rows that enter later", () => {
    const table = createTable(20);
    const vp = new InMemoryViewport(table, {
      id: "vp",
      ...config({ filterSpec: { filter: 'ccy = "EUR"' } }),
      range: { from: 0, to: 50 },
    });
    const client = new ClientModel().apply(vp.getCurrentRange());
    const eur = () =>
      table.rows.filter((r) => r[1] === "EUR").map((r) => r[0] as string);

    client.apply(vp.selectAll());
    expect(vp.isSelectAll).toBe(true);
    expect(vp.selectedRowCount).toBe(eur().length);
    expect([...client.rows.values()].every((r) => r.sel === 1)).toBe(true);

    table.insert(["new-1", "EUR", "XLON", 1, 1]);
    table.insert(["new-2", "GBP", "XLON", 1, 1]);
    client.apply(vp.flush());
    expect(vp.selectedRowCount).toBe(eur().length);
    expect([...client.rows.values()].every((r) => r.sel === 1)).toBe(true);
    expect(sorted(vp.getSelectedRowKeys())).toEqual(sorted(eur()));
    expect(sorted(vp.selectedKeys)).toEqual(sorted(eur()));

    // a row updated into the filter is selected too
    const gbp = table.rows.find((r) => r[1] === "GBP")!;
    table.upsert([gbp[0], "EUR", gbp[2], gbp[3], gbp[4]]);
    client.apply(vp.flush());
    expect(vp.getSelectedRowKeys()).toContain(gbp[0] as string);
    expect(vp.selectedRowCount).toBe(eur().length);
  });

  test("additive changes adjust select all, others end it", () => {
    const table = createTable(10);
    const vp = new InMemoryViewport(table, {
      id: "vp",
      ...config(),
      range: { from: 0, to: 10 },
    });
    const client = new ClientModel().apply(vp.getCurrentRange());
    client.apply(vp.selectAll());

    let batch = vp.deselectRow("id-3", true);
    expect(batch.rows.map((r) => [r.rowKey, r.sel])).toEqual([["id-3", 0]]);
    expect(vp.isSelectAll).toBe(true);
    expect(vp.selectedRowCount).toBe(9);
    expect(vp.getSelectedRowKeys()).not.toContain("id-3");

    vp.deselectRow("id-4", true);
    batch = vp.selectRowRange("id-2", "id-5", true);
    expect(sorted(batch.rows.map((r) => r.rowKey))).toEqual(["id-3", "id-4"]);
    expect(vp.selectedRowCount).toBe(10);

    vp.deselectRow("id-6", true);
    vp.selectRow("id-6", true);
    expect(vp.selectedRowCount).toBe(10);

    // a non additive select replaces select all
    batch = vp.selectRow("id-1", false);
    expect(vp.isSelectAll).toBe(false);
    expect(batch.rows).toHaveLength(9);
    expect(sorted(vp.selectedKeys)).toEqual(["id-1"]);

    client.apply(vp.selectAll());
    batch = vp.deselectAll();
    expect(vp.isSelectAll).toBe(false);
    expect(vp.selectedRowCount).toBe(0);
    expect(batch.rows.every((r) => r.sel === 0)).toBe(true);
    expect(batch.rows).toHaveLength(10);
  });

  test("deleted rows leave the count, reinserted keys are selected", () => {
    const table = createTable(10);
    const vp = new InMemoryViewport(table, {
      id: "vp",
      ...config(),
      range: { from: 0, to: 20 },
    });
    vp.getCurrentRange();
    vp.selectAll();
    vp.deselectRow("id-2", true);
    table.delete("id-2");
    table.delete("id-5");
    vp.flush();
    expect(vp.selectedRowCount).toBe(8);
    table.insert(["id-2", "EUR", "XLON", 1, 1]);
    const batch = vp.flush();
    expect(batch.rows.find((r) => r.rowKey === "id-2")?.sel).toBe(1);
    expect(vp.selectedRowCount).toBe(9);
  });

  test("grouped: all rows selected, deselected group excludes its leaves", () => {
    const table = new Table(schema);
    table.insert(["1", "EUR", "XLON", 10, 1]);
    table.insert(["2", "GBP", "XLON", 20, 2]);
    table.insert(["3", "EUR", "XPAR", 30, 3]);
    table.insert(["4", "EUR", "XLON", 40, 4]);
    table.insert(["5", "USD", "XNYS", 50, 5]);
    const vp = new InMemoryViewport(table, {
      id: "vp",
      columns: ["id", "ccy"],
      groupBy: ["ccy"],
      range: { from: 0, to: 20 },
    });
    vp.getCurrentRange();
    let batch = vp.selectAll();
    expect(batch.rows.map((r) => r.sel)).toEqual([1, 1, 1]);
    expect(vp.selectedRowCount).toBe(3);
    expect(sorted(vp.getSelectedRowKeys())).toEqual(["1", "2", "3", "4", "5"]);

    batch = vp.openTreeNode("$root|EUR");
    expect(batch.rows.every((r) => r.sel === 1)).toBe(true);
    expect(vp.selectedRowCount).toBe(6);

    vp.deselectRow("$root|EUR|3", true);
    expect(sorted(vp.getSelectedRowKeys())).toEqual(["1", "2", "4", "5"]);
    vp.deselectRow("$root|GBP", true);
    expect(sorted(vp.getSelectedRowKeys())).toEqual(["1", "4", "5"]);
    expect(vp.selectedRowCount).toBe(4);
    expect(vp.getSelectedValues("ccy")).toEqual(new Set(["EUR", "USD"]));

    table.insert(["6", "JPY", "XLON", 60, 6]);
    vp.flush();
    expect(vp.getSelectedRowKeys()).toContain("6");
  });
});
