import { describe, expect, test } from "bun:test";
import {
  Table,
  type TableSchema,
  type VuuDataRow,
  type VuuDataRowWithBigint,
} from "@heswell/vuu-table";
import { InMemoryViewport } from "../src/index.ts";
import { sortIndex, toSortSpec } from "../src/sort.ts";

const schema: TableSchema = {
  table: { module: "TEST", table: "trades" },
  key: "id",
  columns: [
    { name: "id", serverDataType: "string" },
    { name: "ccy", serverDataType: "string" },
    { name: "ts", serverDataType: "long" },
    { name: "qty", serverDataType: "long" },
  ],
};

const BIG = 2n ** 60n;

const createTable = (rows: VuuDataRowWithBigint[]) => {
  const table = new Table(schema);
  for (const row of rows) table.insert(row as VuuDataRow);
  return table;
};

const sampleRows = (): VuuDataRowWithBigint[] => [
  ["t1", "EUR", 1_700_000_000_003n, 30n],
  ["t2", "GBP", 1_700_000_000_001n, 10n],
  ["t3", "EUR", 1_700_000_000_004n, 40n],
  ["t4", "USD", 1_700_000_000_002n, 20n],
];

const keysOf = (vp: InMemoryViewport) =>
  vp.getCurrentRange().rows.map((r) => r.rowKey);

describe("InMemoryViewport bigint values", () => {
  test("bigints are output as numbers when safe, as strings otherwise", () => {
    const table = createTable([
      ["t1", "EUR", 5n, BIG + 1n],
      ["t2", "EUR", -(2n ** 53n) + 1n, 1],
    ]);
    const vp = new InMemoryViewport(table, {
      id: "vp1",
      columns: ["id", "ts", "qty"],
      range: { from: 0, to: 10 },
    });
    const { rows } = vp.getCurrentRange();
    expect(rows.map((r) => r.data)).toEqual([
      ["t1", 5, (BIG + 1n).toString()],
      ["t2", -(2 ** 53) + 1, 1],
    ]);
    expect(() => JSON.stringify(rows)).not.toThrow();
  });

  test("sort on safe and unsafe bigint columns, mixed with numbers", () => {
    const table = createTable(sampleRows());
    const vp = new InMemoryViewport(table, {
      id: "vp1",
      columns: ["id", "ts"],
      sort: { sortDefs: [{ column: "ts", sortType: "A" }] },
      range: { from: 0, to: 10 },
    });
    expect(keysOf(vp)).toEqual(["t2", "t4", "t1", "t3"]);

    // incremental maintenance on update and insert, number mixed with bigint
    table.updateByKey("t2", { ts: 1_700_000_000_005n as unknown as number });
    table.insert(["t5", "JPY", 1_700_000_000_000, 1n] as VuuDataRow);
    vp.flush();
    expect(keysOf(vp)).toEqual(["t5", "t4", "t1", "t3", "t2"]);

    // values beyond 2^53 that are distinct but equal as doubles
    table.updateByKey("t1", { ts: (BIG + 2n) as unknown as number });
    table.updateByKey("t3", { ts: (BIG + 1n) as unknown as number });
    vp.setConfig({ sort: { sortDefs: [{ column: "ts", sortType: "D" }] } });
    expect(keysOf(vp)).toEqual(["t1", "t3", "t2", "t4", "t5"]);
  });

  test("sortIndex fast path matches comparator for safe bigints", () => {
    const table = createTable(sampleRows());
    const index = Int32Array.from([0, 1, 2, 3]);
    sortIndex(
      index,
      4,
      table,
      toSortSpec([{ column: "qty", sortType: "D" }], table.columnMap),
    );
    expect(Array.from(index)).toEqual([2, 0, 3, 1]);
  });

  test("filters match bigint values with numeric filter values", () => {
    const table = createTable(sampleRows());
    const vp = new InMemoryViewport(table, {
      id: "vp1",
      columns: ["id", "qty"],
      range: { from: 0, to: 10 },
    });
    const filter = (filter: string) => {
      vp.setConfig({ filterSpec: { filter } });
      return keysOf(vp);
    };
    expect(filter("qty = 20")).toEqual(["t4"]);
    expect(filter("qty != 20")).toEqual(["t1", "t2", "t3"]);
    expect(filter("qty in [10, 40]")).toEqual(["t2", "t3"]);
    expect(filter("qty > 15")).toEqual(["t1", "t3", "t4"]);
    expect(filter("qty < 30")).toEqual(["t2", "t4"]);
    expect(filter("ts > 1700000000002")).toEqual(["t1", "t3"]);
    // base filter, e.g. vuu-ui freeze
    vp.setConfig({ filterSpec: { filter: "" } });
    vp.setBaseFilter({ filter: "ts < 1700000000003" });
    expect(keysOf(vp)).toEqual(["t2", "t4"]);
  });

  test("group by and aggregate bigint columns", () => {
    const table = createTable([
      ["t1", "EUR", 1n, 30n],
      ["t2", "GBP", 1n, 10n],
      ["t3", "EUR", 2n, 40n],
      ["t4", "EUR", 2n, BIG],
    ]);
    const vp = new InMemoryViewport(table, {
      id: "vp1",
      columns: ["ccy", "ts", "qty"],
      groupBy: ["ts"],
      aggregations: [{ column: "qty", aggType: 1 }],
      range: { from: 0, to: 10 },
    });
    const { rows } = vp.getCurrentRange();
    expect(rows.map((r) => r.data)).toEqual([
      [1, false, "$root|1", false, 1, 2, "", 1, 40],
      [1, false, "$root|2", false, 2, 2, "", 2, 40 + Number(BIG)],
    ]);
    expect(() => JSON.stringify(rows)).not.toThrow();

    // incremental aggregate update with bigint values
    table.updateByKey("t1", { qty: 35n as unknown as number });
    expect(vp.flush().rows.map((r) => r.data[8])).toEqual([45]);

    vp.openTreeNode("$root|1");
    expect(
      vp.getCurrentRange().rows.map((r) => [r.rowKey, r.data[7], r.data[8]]),
    ).toEqual([
      ["$root|1", 1, 45],
      ["$root|1|t1", 1, 35],
      ["$root|1|t2", 1, 10],
      ["$root|2", 2, 40 + Number(BIG)],
    ]);
  });

  test("visual link values match across number and bigint", () => {
    const table = createTable(sampleRows());
    const vp = new InMemoryViewport(table, {
      id: "vp1",
      columns: ["id"],
      range: { from: 0, to: 10 },
    });
    vp.setLinkFilter({ column: "qty", values: new Set([10, 40]) });
    expect(keysOf(vp)).toEqual(["t2", "t3"]);
  });

  test("typeahead values of a bigint column", () => {
    const table = createTable(sampleRows());
    const vp = new InMemoryViewport(table, {
      id: "vp1",
      columns: ["id"],
      range: { from: 0, to: 10 },
    });
    vp.getCurrentRange();
    expect(vp.getUniqueValues("qty", "1")).toEqual(["10"]);
  });
});
