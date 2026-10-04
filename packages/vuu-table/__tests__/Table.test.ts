import { describe, expect, test } from "bun:test";
import { JoinTable, Table, type TableSchema } from "../src/index.ts";

const orderSchema: TableSchema = {
  table: { module: "TEST", table: "orders" },
  key: "id",
  columns: [
    { name: "id", serverDataType: "string" },
    { name: "ric", serverDataType: "string" },
    { name: "qty", serverDataType: "int" },
  ],
};

const priceSchema: TableSchema = {
  table: { module: "TEST", table: "prices" },
  key: "ric",
  columns: [
    { name: "ric", serverDataType: "string" },
    { name: "bid", serverDataType: "double" },
  ],
};

const joinSchema: TableSchema = {
  table: { module: "TEST", table: "orderPrices" },
  key: "id",
  columns: [
    { name: "id", serverDataType: "string" },
    { name: "ric", serverDataType: "string" },
    { name: "qty", serverDataType: "int" },
    { name: "bid", serverDataType: "double" },
  ],
};

describe("Table", () => {
  test("insert, update, lookup", () => {
    const table = new Table(orderSchema);
    table.insert(["o1", "AAA.L", 100]);
    table.insert(["o2", "BBB.L", 200]);
    expect(table.rowCount).toBe(2);
    expect(table.getRowAtKey("o2")).toEqual(["o2", "BBB.L", 200]);
    table.upsert(["o2", "BBB.L", 300]);
    expect(table.rowCount).toBe(2);
    expect(table.getRowAtKey("o2")[2]).toBe(300);
    table.updateByKey("o1", { qty: 150 });
    expect(table.getRowAtKey("o1")[2]).toBe(150);
  });

  test("delete uses swap-remove and notifies listeners", () => {
    const table = new Table(orderSchema);
    table.insert(["o1", "AAA.L", 100]);
    table.insert(["o2", "BBB.L", 200]);
    table.insert(["o3", "CCC.L", 300]);
    const events: unknown[] = [];
    table.addListener({
      onDelete: (rowIdx, row, movedFromIdx) =>
        events.push([rowIdx, row[0], movedFromIdx]),
    });
    table.delete("o1");
    expect(events).toEqual([[0, "o1", 2]]);
    expect(table.rows.map((r) => r[0])).toEqual(["o3", "o2"]);
    expect(table.rowIndexAtKey("o3")).toBe(0);
    // natural order preserved by seq
    expect(table.seqAt(0)).toBe(2);
    expect(table.seqAt(1)).toBe(1);
    table.delete("o2");
    expect(events[1]).toEqual([1, "o2", -1]);
    expect(table.rowCount).toBe(1);
  });
});

describe("JoinTable", () => {
  const setup = () => {
    const orders = new Table(orderSchema);
    const prices = new Table(priceSchema);
    prices.insert(["AAA.L", 1.5]);
    orders.insert(["o1", "AAA.L", 100]);
    const join = new JoinTable({
      schema: joinSchema,
      baseTable: orders,
      joinTable: prices,
      leftColumn: "ric",
      rightColumn: "ric",
    });
    return { orders, prices, join };
  };

  test("materializes existing rows", () => {
    const { join } = setup();
    expect(join.getRowAtKey("o1")).toEqual(["o1", "AAA.L", 100, 1.5]);
  });

  test("left outer join, missing right row yields nulls", () => {
    const { orders, join } = setup();
    orders.insert(["o2", "ZZZ.L", 5]);
    expect(join.getRowAtKey("o2")).toEqual(["o2", "ZZZ.L", 5, null]);
  });

  test("tracks changes to right table", () => {
    const { orders, prices, join } = setup();
    orders.insert(["o2", "BBB.L", 5]);
    prices.insert(["BBB.L", 9]);
    expect(join.getRowAtKey("o2")[3]).toBe(9);
    prices.upsert(["AAA.L", 2]);
    expect(join.getRowAtKey("o1")[3]).toBe(2);
    prices.delete("AAA.L");
    expect(join.getRowAtKey("o1")[3]).toBe(null);
  });

  test("tracks changes to base table, including join key", () => {
    const { orders, prices, join } = setup();
    prices.insert(["BBB.L", 9]);
    orders.upsert(["o1", "BBB.L", 100]);
    expect(join.getRowAtKey("o1")).toEqual(["o1", "BBB.L", 100, 9]);
    prices.upsert(["AAA.L", 3]);
    expect(join.getRowAtKey("o1")[3]).toBe(9);
    orders.delete("o1");
    expect(join.rowCount).toBe(0);
  });

  test("join table emits events viewports can consume", () => {
    const { prices, join } = setup();
    const updates: unknown[] = [];
    join.addListener({ onUpdate: (_, row) => updates.push(row) });
    prices.upsert(["AAA.L", 7]);
    expect(updates).toEqual([["o1", "AAA.L", 100, 7]]);
  });
});
