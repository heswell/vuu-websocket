import { describe, expect, test } from "bun:test";
import {
  JoinTable,
  Table,
  type TableSchema,
  type VuuDataRow,
} from "../src/index.ts";

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

  test("bigint key and join values", () => {
    const orders = new Table(orderSchema);
    const prices = new Table(priceSchema);
    const id = (2n ** 60n) as unknown as string;
    prices.insert([123n, 1.5] as unknown as VuuDataRow);
    orders.insert([id, 123n, 100] as unknown as VuuDataRow);
    const join = new JoinTable({
      schema: joinSchema,
      baseTable: orders,
      joinTable: prices,
      leftColumn: "ric",
      rightColumn: "ric",
    });
    const key = (2n ** 60n).toString();
    expect(orders.rowIndexAtKey(key)).toBe(0);
    expect(join.getRowAtKey(key)[3]).toBe(1.5);
    prices.upsert([123n, 2] as unknown as VuuDataRow);
    expect(join.getRowAtKey(key)[3]).toBe(2);
  });

  test("join schema defines column order", () => {
    const orders = new Table(orderSchema);
    const prices = new Table(priceSchema);
    prices.insert(["AAA.L", 1.5]);
    orders.insert(["o1", "AAA.L", 100]);
    const join = new JoinTable({
      schema: {
        ...joinSchema,
        columns: [...joinSchema.columns].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      },
      baseTable: orders,
      joinTable: prices,
      leftColumn: "ric",
      rightColumn: "ric",
    });
    const names = join.columns.map((c) => c.name);
    const expected: Record<string, unknown> = {
      id: "o1",
      ric: "AAA.L",
      qty: 100,
      bid: 1.5,
    };
    expect(join.getRowAtKey("o1")).toEqual(names.map((n) => expected[n]));
  });
});

describe("JoinTable, inner join", () => {
  const setup = () => {
    const orders = new Table(orderSchema);
    const prices = new Table(priceSchema);
    prices.insert(["AAA.L", 1.5]);
    orders.insert(["o1", "AAA.L", 100]);
    orders.insert(["o2", "BBB.L", 200]);
    const join = new JoinTable({
      schema: joinSchema,
      baseTable: orders,
      joinTable: prices,
      leftColumn: "ric",
      rightColumn: "ric",
      joinType: "inner",
    });
    const events: unknown[] = [];
    join.addListener({
      onInsert: (_, row) => events.push(["insert", row[0]]),
      onUpdate: (_, row) => events.push(["update", row[0]]),
      onDelete: (_, row) => events.push(["delete", row[0]]),
    });
    const keys = () => join.rows.map((r) => r[0]);
    return { orders, prices, join, events, keys };
  };

  test("only base rows with a matching right row are present", () => {
    const { join, keys } = setup();
    expect(join.joinType).toBe("inner");
    expect(keys()).toEqual(["o1"]);
    expect(join.getRowAtKey("o1")).toEqual(["o1", "AAA.L", 100, 1.5]);
  });

  test("rows appear and disappear as right rows are inserted and deleted", () => {
    const { prices, events, keys } = setup();
    prices.insert(["BBB.L", 9]);
    expect(keys()).toEqual(["o1", "o2"]);
    prices.delete("AAA.L");
    expect(keys()).toEqual(["o2"]);
    expect(events).toEqual([
      ["insert", "o2"],
      ["delete", "o1"],
    ]);
  });

  test("base inserts, join key changes and deletes", () => {
    const { orders, prices, events, keys } = setup();
    orders.insert(["o3", "CCC.L", 5]);
    orders.insert(["o4", "AAA.L", 6]);
    expect(keys()).toEqual(["o1", "o4"]);
    // join value moves to a non-matching value, then back
    orders.upsert(["o1", "ZZZ.L", 100]);
    expect(keys()).toEqual(["o4"]);
    orders.upsert(["o1", "AAA.L", 101]);
    expect(keys()).toEqual(["o4", "o1"]);
    // deleting base rows, matched or not
    orders.delete("o3");
    orders.delete("o4");
    expect(keys()).toEqual(["o1"]);
    prices.upsert(["AAA.L", 2]);
    expect(events).toEqual([
      ["insert", "o4"],
      ["delete", "o1"],
      ["insert", "o1"],
      ["delete", "o4"],
      ["update", "o1"],
    ]);
  });

  test("right join column not the right key", () => {
    const orders = new Table(orderSchema);
    const quotes = new Table({
      table: { module: "TEST", table: "quotes" },
      key: "quoteId",
      columns: [
        { name: "quoteId", serverDataType: "string" },
        { name: "ric", serverDataType: "string" },
        { name: "bid", serverDataType: "double" },
      ],
    });
    orders.insert(["o1", "AAA.L", 100]);
    const join = new JoinTable({
      schema: joinSchema,
      baseTable: orders,
      joinTable: quotes,
      leftColumn: "ric",
      rightColumn: "ric",
      joinType: "inner",
    });
    expect(join.rowCount).toBe(0);
    quotes.insert(["q1", "AAA.L", 3]);
    expect(join.getRowAtKey("o1")).toEqual(["o1", "AAA.L", 100, 3]);
    quotes.upsert(["q1", "BBB.L", 3]);
    expect(join.rowCount).toBe(0);
  });

  test("clearing the right table empties the join", () => {
    const { prices, join } = setup();
    prices.clear();
    expect(join.rowCount).toBe(0);
  });
});
