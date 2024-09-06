import { describe, expect, test } from "bun:test";
import { DataView, Table } from "../src";
import { TableSchema } from "@vuu-ui/vuu-data-types";
import { GroupRowSet, RowSet } from "../src/store/rowset";

const schema: TableSchema = {
  columns: [
    { name: "id", serverDataType: "string" },
    { name: "ric", serverDataType: "string" },
    { name: "currency", serverDataType: "string" },
    { name: "exchange", serverDataType: "string" },
    { name: "lotSize", serverDataType: "string" },
    { name: "price", serverDataType: "double" },
    { name: "quantity", serverDataType: "long" },
  ],
  key: "id",
  table: {
    module: "TEST",
    table: "instruments",
  },
};

// prettier-ignore
const data = [
    ["0001", "VOD.A", "GBP", "XLON", 100, 250, 1000],
    ["0002", "VOD.B", "USD", "XLON", 100, 350, 2000],
    ["0003", "VOD.C", "GBP", "XLON", 200, 400, 3000],
    ["0004", "VOD.D", "USD", "NYSE", 200, 150, 4000],
    ["0005", "VOD.E", "GBP", "XLON", 150, 175, 5000],
    ["0006", "VOD.F", "SEK", "XLON", 150, 500, 6000],
    ["0007", "VOD.G", "GBP", "XLON", 100, 200, 7000],
    ["0008", "VOD.H", "GBP", "NYSE", 100, 400, 8000],
    ["0009", "VOD.I", "CHF", "XLON", 80, 400, 9000],
    ["0010", "VOD.J", "SEK", "HKSE", 50, 250, 10000]
];

const table = new Table({ data, schema });

describe("RowSet", () => {
  test("RowSet construction", () => {
    const rowSet = new RowSet("test-1", table, schema.columns);
    expect(rowSet.size).toEqual(10);
  });
});

describe("GroupRowSet", () => {
  test("construction, single group level", () => {
    const groupRowSet = new GroupRowSet(
      new RowSet("test-1", table, schema.columns),
      ["currency"]
    );
    const { rows, size } = groupRowSet.setRange({ from: 0, to: 10 });
    expect(size).toEqual(4);
  });

  test("openTreeNode", () => {
    const groupRowSet = new GroupRowSet(
      new RowSet("test-1", table, schema.columns),
      ["currency"]
    );
    groupRowSet.setRange({ from: 0, to: 10 });

    groupRowSet.openTreeNode("$root/GBP");
    const { rows, size } = groupRowSet.setRange({ from: 0, to: 10 }, false);
    // expect(size).toEqual(9);
    console.table(rows);
  });
});
