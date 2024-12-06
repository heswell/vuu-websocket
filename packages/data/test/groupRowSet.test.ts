import { describe, expect, test } from "bun:test";
import { Table } from "../src";
import { TableSchema } from "@vuu-ui/vuu-data-types";
import { GroupRowSet, RowSet } from "../src/store/rowset";
import { getData } from "./instrument-data";

const schema: TableSchema = {
  columns: [
    { name: "Symbol", serverDataType: "string" },
    { name: "Name", serverDataType: "string" },
    { name: "Price", serverDataType: "double" },
    { name: "MarketCap", serverDataType: "long" },
    { name: "IPO", serverDataType: "string" },
    { name: "Sector", serverDataType: "string" },
    { name: "Industry", serverDataType: "int" },
  ],
  key: "Symbol",
  table: {
    module: "TEST",
    table: "instruments",
  },
};

const table = new Table({ schema });
getData(schema).forEach((row) => table.insert(row, false));

describe("GroupRowSet", () => {
  describe("construction", () => {
    test("single group", () => {
      const groupRowSet = new GroupRowSet(
        new RowSet("test-1", table, schema.columns),
        ["Sector"]
      );
      const { rows, size } = groupRowSet.setRange({ from: 0, to: 20 });
      expect(size).toEqual(12);
      expect(rows.length).toEqual(12);
    });
  });

  describe("Open and close Nodes", () => {
    describe("single group", () => {
      test("open single node", () => {
        const groupRowSet = new GroupRowSet(
          new RowSet("test-1", table, schema.columns),
          ["Sector"]
        );
        groupRowSet.openTreeNode("$root|Basic Industries");
        const { rows, size } = groupRowSet.setRange({ from: 0, to: 20 }, false);
        expect(rows.length).toEqual(20);
        expect(size).toEqual(39);
      });

      test("open single node, select group and leaf items", () => {
        const groupRowSet = new GroupRowSet(
          new RowSet("test-1", table, schema.columns),
          ["Sector"]
        );
        groupRowSet.openTreeNode("$root|Capital Goods");
        groupRowSet.setRange({ from: 0, to: 20 }, false);
        const { rows, size } = groupRowSet.select([1, 2]);
        expect(rows.length).toEqual(2);
        expect(size).toEqual(91);
        const [groupRow, leafRow] = rows;
        expect(groupRow.sel).toEqual(1);
        expect(leafRow.sel).toEqual(1);
      });

      test("open single node, select group and leaf items, close node select none", () => {
        const groupRowSet = new GroupRowSet(
          new RowSet("test-1", table, schema.columns),
          ["Sector"]
        );
        groupRowSet.openTreeNode("$root|Capital Goods");
        groupRowSet.setRange({ from: 0, to: 20 }, false);
        groupRowSet.select([1, 2]);
        groupRowSet.closeTreeNode("$root|Capital Goods");
        const { rows, size } = groupRowSet.select([]);

        expect(rows.length).toEqual(1);
        expect(size).toEqual(12);

        const [groupRow] = rows;
        expect(groupRow.sel).toEqual(0);
      });

      test("open two nodes", () => {
        const groupRowSet = new GroupRowSet(
          new RowSet("test-1", table, schema.columns),
          ["Sector"]
        );
        groupRowSet.openTreeNode("$root|Basic Industries");
        groupRowSet.openTreeNode("$root|Technology");
        const { rows, size } = groupRowSet.setRange({ from: 0, to: 20 }, false);
        expect(rows.length).toEqual(20);
        expect(size).toEqual(342);
      });

      test("open two nodes, close one", () => {
        const groupRowSet = new GroupRowSet(
          new RowSet("test-1", table, schema.columns),
          ["Sector"]
        );
        groupRowSet.openTreeNode("$root|Basic Industries");
        groupRowSet.openTreeNode("$root|Technology");
        groupRowSet.closeTreeNode("$root|Basic Industries");
        const { rows, size } = groupRowSet.setRange({ from: 0, to: 20 }, false);
        expect(rows.length).toEqual(20);
        expect(size).toEqual(315);
      });

      test("open two nodes, close both", () => {
        const groupRowSet = new GroupRowSet(
          new RowSet("test-1", table, schema.columns),
          ["Sector"]
        );
        groupRowSet.openTreeNode("$root|Basic Industries");
        groupRowSet.openTreeNode("$root|Technology");
        groupRowSet.closeTreeNode("$root|Basic Industries");
        groupRowSet.closeTreeNode("$root|Technology");
        const { rows, size } = groupRowSet.setRange({ from: 0, to: 20 }, false);
        expect(rows.length).toEqual(12);
        expect(size).toEqual(12);
      });
    });

    describe("two groups", () => {
      test("remove second group, whilst node expanded", () => {
        const groupRowSet = new GroupRowSet(
          new RowSet("test-1", table, schema.columns),
          ["Sector", "Industry"]
        );
        groupRowSet.openTreeNode("$root|Capital Goods");
        groupRowSet.setGroupBy(["Sector"]);
        const { rows, size } = groupRowSet.setRange({ from: 0, to: 20 }, false);
        expect(rows.length).toEqual(20);
        expect(size).toEqual(91);
      });

      test("remove first group, whilst node expanded", () => {
        const groupRowSet = new GroupRowSet(
          new RowSet("test-1", table, schema.columns),
          ["Sector", "Industry"]
        );
        groupRowSet.openTreeNode("$root|Capital Goods");
        groupRowSet.setGroupBy(["Industry"]);
        const { rows, size } = groupRowSet.setRange({ from: 0, to: 20 }, false);
        expect(rows.length).toEqual(20);
        expect(size).toEqual(109);
      });

      test("open first level group, select group", () => {
        const groupRowSet = new GroupRowSet(
          new RowSet("test-1", table, schema.columns),
          ["Sector", "Industry"]
        );
        groupRowSet.openTreeNode("$root|Capital Goods");
        groupRowSet.setRange({ from: 0, to: 20 }, false);
        const { rows, size } = groupRowSet.select([1]);
        expect(rows.length).toEqual(1);
        expect(size).toEqual(32);
        const [row] = rows;
        expect(row.sel).toEqual(1);
      });
    });
  });
});
