import "./browser-globals";
import { describe, expect, it, vi } from "bun:test";
import type { TableSchema } from "@vuu-ui/vuu-data-types";
import { Range } from "@vuu-ui/vuu-utils";
import {
  createJoinTable,
  TableContainer,
} from "../src/core/table/TableContainer";
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

// createJoinTable options: control the columns (and order) of the join table,
// so a declared schema (e.g. trader's instrumentPrices) can be matched.
describe("createJoinTable options", () => {
  const JOIN = { module: "TEST", table: "instrumentPrices" };
  const sources = () => ({
    instruments: new Table(instrumentsSchema, [
      ["A", "XLON"],
      ["B", "XLON"],
    ]),
    prices: new Table(pricesSchema, [["A", 1.5, 10]]),
  });
  const names = (table: Table) => table.schema.columns.map((c) => c.name);

  it("accepts a JoinType as the fifth argument (positional, unchanged)", () => {
    const { instruments, prices } = sources();
    const join = createJoinTable(JOIN, instruments, prices, "ric", "leftOuter");
    expect(names(join)).toEqual(["bid", "bidSize", "exchange", "ric"]);
    expect(join.rowCount).toBe(2);
  });

  it("columns: preserves the given order", () => {
    const { instruments, prices } = sources();
    const join = createJoinTable(JOIN, instruments, prices, "ric", {
      columns: ["ric", "exchange", "bid", "bidSize"],
      joinType: "leftOuter",
    });
    expect(names(join)).toEqual(["ric", "exchange", "bid", "bidSize"]);
    expect(join.schema.columns.map((c) => c.serverDataType)).toEqual([
      "string",
      "string",
      "double",
      "int",
    ]);
    expect(join.schema.key).toBe("ric");
    expect(join.schema.table).toEqual(JOIN);
  });

  it("columns: a subset excludes the other columns", async () => {
    const { instruments, prices } = sources();
    const join = createJoinTable(JOIN, instruments, prices, "ric", {
      columns: ["bid", "ric"],
      joinType: "leftOuter",
    });
    expect(names(join)).toEqual(["bid", "ric"]);
    const dataSource = new EngineDataSource({
      columnDescriptors: join.schema.columns,
      table: join,
    });
    await dataSource.subscribe({ range: Range(0, 10) }, vi.fn());
    expect(
      rows(dataSource).map((row) => row?.slice(DATA) as unknown[]),
    ).toEqual([
      [1.5, "A"],
      [null, "B"],
    ]);
  });

  it("defaults to inner when only columns are given", () => {
    const { instruments, prices } = sources();
    const join = createJoinTable(JOIN, instruments, prices, "ric", {
      columns: ["ric", "bid"],
    });
    expect(join.rowCount).toBe(1);
  });

  it("schema: uses a declared schema, order preserved", async () => {
    const { instruments, prices } = sources();
    const declared: TableSchema = {
      key: "ric",
      table: JOIN,
      columns: [
        { name: "ric", serverDataType: "string" },
        { name: "exchange", serverDataType: "string" },
        { name: "bid", serverDataType: "double" },
      ],
    };
    const join = createJoinTable(JOIN, instruments, prices, "ric", {
      schema: declared,
      joinType: "leftOuter",
    });
    expect(join.schema.columns).toEqual(declared.columns);
    expect(join.schema.key).toBe("ric");
    expect(join.schema.table).toEqual(JOIN);
    expect(join.schema.rangeLimits).toBeDefined();
    const dataSource = new EngineDataSource({
      columnDescriptors: join.schema.columns,
      table: join,
    });
    await dataSource.subscribe({ range: Range(0, 10) }, vi.fn());
    expect(
      rows(dataSource).map((row) => row?.slice(DATA) as unknown[]),
    ).toEqual([
      ["A", "XLON", 1.5],
      ["B", "XLON", null],
    ]);
    // live updates still flow through the declared layout
    prices.insert(["B", 2.5, 5]);
    expect(rows(dataSource)[1]?.slice(DATA)).toEqual(["B", "XLON", 2.5]);
  });

  it("TableContainer.createJoinTable accepts options", () => {
    const { instruments, prices } = sources();
    const container = new TableContainer();
    container.addTable(instruments);
    container.addTable(prices);
    const join = container.createJoinTable(
      JOIN,
      instrumentsSchema.table,
      pricesSchema.table,
      "ric",
      { columns: ["ric", "bid"], joinType: "leftOuter" },
    );
    expect(names(join)).toEqual(["ric", "bid"]);
    expect(container.getTable(JOIN)).toBe(join);
  });

  it("unknown column: clear error", () => {
    const { instruments, prices } = sources();
    expect(() =>
      createJoinTable(JOIN, instruments, prices, "ric", {
        columns: ["ric", "ask"],
      }),
    ).toThrow(
      "[createJoinTable] TEST:instrumentPrices: unknown column ask, not in instruments or prices",
    );
  });

  it("rejects duplicate columns, a missing key and columns with schema", () => {
    const { instruments, prices } = sources();
    const join = (options: Parameters<typeof createJoinTable>[4]) => () =>
      createJoinTable(JOIN, instruments, prices, "ric", options);
    expect(join({ columns: ["ric", "bid", "bid"] })).toThrow(
      "duplicate column bid",
    );
    expect(join({ columns: ["bid"] })).toThrow(
      "columns must include the key column ric",
    );
    expect(
      join({
        columns: ["ric"],
        schema: { key: "ric", table: JOIN, columns: [] },
      }),
    ).toThrow("pass either columns or schema, not both");
  });

  it("rejects a declared schema that does not match the sources", () => {
    const { instruments, prices } = sources();
    const join = (schema: TableSchema) => () =>
      createJoinTable(JOIN, instruments, prices, "ric", { schema });
    const columns = [{ name: "ric", serverDataType: "string" as const }];
    expect(
      join({ key: "ric", table: { module: "TEST", table: "other" }, columns }),
    ).toThrow("schema is for table TEST:other");
    expect(join({ key: "exchange", table: JOIN, columns })).toThrow(
      "schema key exchange must be the key of instruments (ric)",
    );
    expect(
      join({
        key: "ric",
        table: JOIN,
        columns: [...columns, { name: "bid", serverDataType: "int" }],
      }),
    ).toThrow("column bid is declared int but is double in the source table");
  });
});
