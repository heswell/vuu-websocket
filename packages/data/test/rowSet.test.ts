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

describe("RowSet", () => {
  describe("simple table, no other criteria", () => {
    test("RowSet construction", () => {
      const rowSet = new RowSet("test-1", table, schema.columns);
      expect(rowSet.size).toEqual(1247);
    });
  });
  describe("filter", () => {
    test("equals filter", () => {
      const rowSet = new RowSet("test-1", table, schema.columns);
      rowSet.filter({ column: "Sector", op: "=", value: "Technology" });
      expect(rowSet.size).toEqual(303);
    });
    test("filter sorted rowset", () => {
      const rowSet = new RowSet("test-1", table, schema.columns);
      rowSet.sort([{ column: "IPO", sortType: "A" }]);
      rowSet.filter({ column: "Sector", op: "=", value: "Basic Industries" });

      expect(rowSet.size).toEqual(27);

      const values = rowSet.slice(0, rowSet.size).map((row) => row.data[4]);
      expect(values).toEqual(values.toSorted());
    });
  });
});
