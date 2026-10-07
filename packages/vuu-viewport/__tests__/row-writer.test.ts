import { describe, expect, test } from "bun:test";
import { Table, type TableSchema } from "@heswell/vuu-table";
import {
  InMemoryViewport,
  inMemoryDataEngine,
  type RowHeader,
  type RowWriter,
  type ViewportRow,
} from "../src/index.ts";

const schema: TableSchema = {
  table: { module: "TEST", table: "orders" },
  key: "id",
  columns: [
    { name: "id", serverDataType: "string" },
    { name: "ccy", serverDataType: "string" },
    { name: "qty", serverDataType: "long" },
    { name: "vuuCreatedTimestamp", serverDataType: "long" },
    { name: "vuuUpdatedTimestamp", serverDataType: "long" },
  ],
};

const createTable = () => {
  const table = new Table(schema);
  table.insert(["o1", "EUR", 100, 1, 10]);
  table.insert(["o2", "EUR", 200, 2, 20]);
  table.insert(["o3", "GBP", 300, 3, 30]);
  return table;
};

type ClientRow = unknown[];
const HEADER_SIZE = 10;

/** builds browser style rows, header slots followed by column values */
const clientRowWriter: RowWriter<ClientRow> = {
  dataOffset: HEADER_SIZE,
  treeColumnsInData: false,
  create: (h: Readonly<RowHeader>, valueCount) => {
    const row: ClientRow = new Array(HEADER_SIZE + valueCount);
    row[0] = h.rowIndex;
    row[1] = h.isLeaf;
    row[2] = h.isExpanded;
    row[3] = h.depth;
    row[4] = h.childCount;
    row[5] = h.rowKey;
    row[6] = h.sel;
    row[7] = h.ts;
    row[8] = h.treeKey;
    row[9] = h.label;
    return row;
  },
  values: (row) => row,
};

const asClientRow = (
  { rowIndex, rowKey, sel, ts, data }: ViewportRow,
  grouped: boolean,
): ClientRow =>
  grouped
    ? [
        rowIndex,
        data[3],
        data[1],
        data[0],
        data[5],
        rowKey,
        sel,
        ts,
        data[2],
        data[4],
        ...data.slice(6),
      ]
    : [rowIndex, false, false, 0, 0, rowKey, sel, ts, "", "", ...data];

const options = (groupBy: string[] = []) => ({
  id: "vp1",
  columns: ["id", "qty", "ccy"],
  groupBy,
  aggregations: groupBy.length ? [{ column: "qty", aggType: 1 as const }] : [],
  range: { from: 0, to: 10 },
});

describe("RowWriter", () => {
  test("default writer produces ViewportRow", () => {
    const vp = new InMemoryViewport(createTable(), options());
    expect(vp.getCurrentRange().rows[0]).toEqual({
      rowIndex: 0,
      rowKey: "o1",
      sel: 0,
      ts: 10,
      data: ["o1", 100, "EUR"],
    });
  });

  test("custom writer matches default writer, flat", () => {
    const table = createTable();
    const a = new InMemoryViewport(table, options());
    const b = inMemoryDataEngine.createViewport(table, {
      ...options(),
      rowWriter: clientRowWriter,
    });
    expect(b.getCurrentRange().rows).toEqual(
      a.getCurrentRange().rows.map((r) => asClientRow(r, false)),
    );
    table.updateByKey("o2", { qty: 201 });
    a.selectRow("o3", false);
    b.selectRow("o3", false);
    expect(b.flush().rows).toEqual(
      a.flush().rows.map((r) => asClientRow(r, false)),
    );
  });

  test("custom writer matches default writer, grouped", () => {
    const table = createTable();
    const a = new InMemoryViewport(table, options(["ccy"]));
    const b = new InMemoryViewport(table, {
      ...options(["ccy"]),
      rowWriter: clientRowWriter,
    });
    a.getCurrentRange();
    b.getCurrentRange();
    const expected = a
      .openTreeNode("$root|EUR")
      .rows.map((r) => asClientRow(r, true));
    const actual = b.openTreeNode("$root|EUR").rows;
    expect(actual).toEqual(expected);
    // includes group and leaf rows
    expect(actual.map((r) => r[1])).toContain(true);
    expect(actual.map((r) => r[1])).toContain(false);

    table.updateByKey("o1", { qty: 150 });
    expect(b.flush().rows).toEqual(
      a.flush().rows.map((r) => asClientRow(r, true)),
    );
  });

  test("tree columns included in data when treeColumnsInData", () => {
    const table = createTable();
    const writer: RowWriter<ViewportRow> = {
      dataOffset: 1,
      treeColumnsInData: true,
      create: ({ rowIndex, rowKey, sel, ts }, n) => ({
        rowIndex,
        rowKey,
        sel,
        ts,
        data: new Array(n + 1).fill("x"),
      }),
      values: (r) => r.data,
    };
    const a = new InMemoryViewport(table, options(["ccy"]));
    const b = new InMemoryViewport(table, {
      ...options(["ccy"]),
      rowWriter: writer,
    });
    expect(b.getCurrentRange().rows).toEqual(
      a.getCurrentRange().rows.map((r) => ({ ...r, data: ["x", ...r.data] })),
    );
  });
});
