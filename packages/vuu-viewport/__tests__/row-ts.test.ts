import { describe, expect, test } from "bun:test";
import { Table, type TableSchema, type VuuDataRow } from "@heswell/vuu-table";
import { InMemoryViewport } from "../src/index.ts";

const schema = (withTs: boolean): TableSchema => ({
  table: { module: "TEST", table: "orders" },
  key: "id",
  columns: [
    { name: "id", serverDataType: "string" },
    { name: "ccy", serverDataType: "string" },
    { name: "qty", serverDataType: "int" },
    ...(withTs
      ? [
          { name: "vuuCreatedTimestamp", serverDataType: "long" as const },
          { name: "vuuUpdatedTimestamp", serverDataType: "long" as const },
        ]
      : []),
  ],
});

const createViewport = (table: Table, groupBy: string[] = []) =>
  new InMemoryViewport(table, {
    id: "vp1",
    columns: ["id", "qty"],
    groupBy,
    range: { from: 0, to: 10 },
  });

describe("InMemoryViewport row timestamp", () => {
  test("ts is the row's vuuUpdatedTimestamp, projected or not", () => {
    const table = new Table(schema(true));
    table.insert(["o1", "EUR", 100, 1000, 1500]);
    table.insert(["o2", "GBP", 200, 2000, 2500]);
    const vp = createViewport(table);
    expect(vp.getCurrentRange().rows.map((r) => [r.rowKey, r.ts])).toEqual([
      ["o1", 1500],
      ["o2", 2500],
    ]);
  });

  test("ts advances when a row is updated", () => {
    const table = new Table(schema(true));
    table.insert(["o1", "EUR", 100, 1000, 1000]);
    const vp = createViewport(table);
    vp.getCurrentRange();
    const before = Date.now();
    table.updateByKey("o1", { qty: 101 });
    const [row] = vp.flush().rows;
    expect(row.data).toEqual(["o1", 101]);
    expect(row.ts).toBeGreaterThanOrEqual(before);
  });

  test("inserted rows are stamped by the table", () => {
    const table = new Table(schema(true));
    const before = Date.now();
    table.insert(["o1", "EUR", 100, 0, 0] as VuuDataRow);
    const [row] = createViewport(table).getCurrentRange().rows;
    expect(row.ts).toBeGreaterThanOrEqual(before);
  });

  test("ts is 0 when the table has no vuuUpdatedTimestamp column", () => {
    const table = new Table(schema(false));
    table.insert(["o1", "EUR", 100]);
    expect(createViewport(table).getCurrentRange().rows[0].ts).toBe(0);
  });

  test("bigint timestamps are converted to numbers", () => {
    const table = new Table(schema(true));
    table.insert(["o1", "EUR", 100, 1000n, 1500n] as unknown as VuuDataRow);
    expect(createViewport(table).getCurrentRange().rows[0].ts).toBe(1500);
  });

  test("grouped: leaf rows carry ts, group rows are 0", () => {
    const table = new Table(schema(true));
    table.insert(["o1", "EUR", 100, 1000, 1500]);
    table.insert(["o2", "EUR", 200, 2000, 2500]);
    const vp = createViewport(table, ["ccy"]);
    vp.getCurrentRange();
    vp.openTreeNode("$root|EUR");
    expect(vp.getCurrentRange().rows.map((r) => [r.rowKey, r.ts])).toEqual([
      ["$root|EUR", 0],
      ["$root|EUR|o1", 1500],
      ["$root|EUR|o2", 2500],
    ]);
  });
});
