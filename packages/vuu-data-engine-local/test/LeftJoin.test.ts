import "./browser-globals";
import { describe, expect, it, vi } from "bun:test";
import type { TableSchema } from "@vuu-ui/vuu-data-types";
import { Range } from "@vuu-ui/vuu-utils";
import { createJoinTable } from "../src/core/table/TableContainer";
import { EngineDataSource } from "../src/EngineDataSource";
import { Table } from "../src/Table";

// trader upstream issue 33: unmatched LEFT JOIN columns must be null (rendered
// empty by vuu-ui), never 0, and sort / filter / groupBy must cope with them.

const KEY = 6;
const DATA = 10;

const instrumentsSchema: TableSchema = {
  key: "ric",
  table: { module: "TEST", table: "instruments" },
  columns: [
    { name: "ric", serverDataType: "string" },
    { name: "exchange", serverDataType: "string" },
  ],
};
const pricesSchema: TableSchema = {
  key: "ric",
  table: { module: "TEST", table: "prices" },
  columns: [
    { name: "ric", serverDataType: "string" },
    { name: "bid", serverDataType: "double" },
    { name: "bidSize", serverDataType: "int" },
  ],
};

const setup = (joinType?: "inner" | "leftOuter") => {
  const instruments = new Table(instrumentsSchema, [
    ["A", "XLON"],
    ["B", "XLON"],
    ["C", "XNYS"],
  ]);
  const prices = new Table(pricesSchema, [
    ["A", 1.5, 10],
    ["C", 0.5, 20],
  ]);
  const join = createJoinTable(
    { module: "TEST", table: "instrumentPrices" },
    instruments,
    prices,
    "ric",
    joinType,
  );
  const dataSource = new EngineDataSource({
    columnDescriptors: join.schema.columns,
    table: join,
  });
  const col = (name: string) =>
    DATA + join.schema.columns.findIndex((c) => c.name === name);
  return { dataSource, join, prices, col };
};

const rows = (dataSource: EngineDataSource) =>
  Array.from({ length: dataSource.size }, (_, i) =>
    dataSource.getRowAtIndex(i),
  );
const keys = (dataSource: EngineDataSource) =>
  rows(dataSource).map((row) => row?.[KEY]);

describe("createJoinTable joinType", () => {
  it("defaults to inner: unmatched base rows are omitted", async () => {
    const { dataSource } = setup();
    await dataSource.subscribe({ range: Range(0, 10) }, vi.fn());
    expect(keys(dataSource)).toEqual(["A", "C"]);
  });

  it("leftOuter: unmatched right columns are null, not 0", async () => {
    const { dataSource, col } = setup("leftOuter");
    await dataSource.subscribe({ range: Range(0, 10) }, vi.fn());
    expect(keys(dataSource)).toEqual(["A", "B", "C"]);
    const b = rows(dataSource)[1]!;
    expect(b[col("exchange")]).toBe("XLON");
    expect(b[col("bid")]).toBeNull();
    expect(b[col("bidSize")]).toBeNull();
  });

  it("leftOuter: right columns return to null when the right row is deleted", async () => {
    const { dataSource, prices, col } = setup("leftOuter");
    await dataSource.subscribe({ range: Range(0, 10) }, vi.fn());
    prices.delete("A");
    expect(rows(dataSource)[0]![col("bid")]).toBeNull();
  });

  it("leftOuter: sort, filter and groupBy handle nulls", async () => {
    const { dataSource, col } = setup("leftOuter");
    await dataSource.subscribe({ range: Range(0, 10) }, vi.fn());

    dataSource.sort = { sortDefs: [{ column: "bid", sortType: "A" }] };
    expect(keys(dataSource)).toEqual(["B", "C", "A"]);
    dataSource.sort = { sortDefs: [{ column: "bid", sortType: "D" }] };
    expect(keys(dataSource)).toEqual(["A", "C", "B"]);
    dataSource.sort = { sortDefs: [] };

    dataSource.filter = { filter: "bid < 1" };
    expect(keys(dataSource)).toEqual(["C"]);
    dataSource.filter = { filter: "bidSize >= 0" };
    expect(keys(dataSource)).toEqual(["A", "C"]);
    dataSource.filter = { filter: "" };

    dataSource.aggregations = [{ column: "bid", aggType: 1 }];
    dataSource.groupBy = ["exchange"];
    const xlon = rows(dataSource).find(
      (row) => row?.[col("exchange")] === "XLON",
    );
    // sum over A (1.5) and B (null): the null is skipped, not NaN
    expect(xlon?.[col("bid")]).toBe(1.5);
  });
});
