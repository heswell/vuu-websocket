import "./browser-globals";
import { describe, expect, it, vi } from "bun:test";
import type {
  DataSourceSubscribeCallback,
  TableSchema,
} from "@vuu-ui/vuu-data-types";
import { Range } from "@vuu-ui/vuu-utils";
import { EngineDataSource } from "../src/EngineDataSource";
import { buildDataColumnMapFromSchema, Table } from "../src/Table";

// DataSourceRow metadata
const IS_LEAF = 2;
const IS_EXPANDED = 3;
const DEPTH = 4;
const CHILD_COUNT = 5;
const KEY = 6;
const DATA = 10;

const schema: TableSchema = {
  columns: [
    { name: "id", serverDataType: "string" },
    { name: "ccy", serverDataType: "string" },
    { name: "exchange", serverDataType: "string" },
    { name: "price", serverDataType: "double" },
    { name: "qty", serverDataType: "int" },
    { name: "trader", serverDataType: "string" },
  ],
  key: "id",
  table: { module: "TEST", table: "orders" },
};

const col = (name: string) =>
  DATA + schema.columns.findIndex((column) => column.name === name);

// USD: 1, 3, 6   EUR: 2, 5   GBP: 4
const createTable = () =>
  new Table(
    schema,
    [
      ["1", "USD", "XNYS", 100, 10, "alice"],
      ["2", "EUR", "XPAR", 300, 20, "bob"],
      ["3", "USD", "XNYS", 200, 30, "bob"],
      ["4", "GBP", "XLON", 400, 40, "alice"],
      ["5", "EUR", "XETR", 50, 50, "carol"],
      ["6", "USD", "XLON", 600, 60, "alice"],
    ],
    buildDataColumnMapFromSchema(schema),
  );

const SUM = 1;
const AVG = 2;
const COUNT = 3;
const HIGH = 4;
const LOW = 5;
const DISTINCT = 6;

const createDataSource = async (table = createTable()) => {
  const dataSource = new EngineDataSource({
    columnDescriptors: schema.columns,
    table,
  });
  const callback = vi.fn<DataSourceSubscribeCallback>();
  await dataSource.subscribe({ range: Range(0, 20) }, callback);
  return { callback, dataSource, table };
};

type Row = NonNullable<ReturnType<EngineDataSource["getRowAtIndex"]>>;

const rows = (dataSource: EngineDataSource) => {
  const result: Row[] = [];
  for (let i = 0; i < dataSource.size; i++) {
    const row = dataSource.getRowAtIndex(i);
    if (row) result.push(row);
  }
  return result;
};

const keys = (dataSource: EngineDataSource) =>
  rows(dataSource).map((row) => row[KEY]);

const groupRow = (dataSource: EngineDataSource, key: string) =>
  rows(dataSource).find((row) => row[KEY] === key);

const distinctValues = (value: unknown) => String(value).split(",").sort();

const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("grouped EngineDataSource", () => {
  describe("aggregations", () => {
    it("computes sum, average, count, high, low and distinct per group", async () => {
      const { dataSource } = await createDataSource();
      dataSource.groupBy = ["ccy"];
      dataSource.aggregations = [
        { column: "price", aggType: SUM },
        { column: "qty", aggType: AVG },
        { column: "id", aggType: COUNT },
        { column: "exchange", aggType: DISTINCT },
      ];
      const usd = groupRow(dataSource, "$root|USD");
      expect(usd?.[col("price")]).toBe(900);
      expect(usd?.[col("qty")]).toBeCloseTo(100 / 3);
      expect(usd?.[col("id")]).toBe(3);
      expect(distinctValues(usd?.[col("exchange")])).toEqual(["XLON", "XNYS"]);

      dataSource.aggregations = [
        { column: "price", aggType: HIGH },
        { column: "qty", aggType: LOW },
      ];
      const eur = groupRow(dataSource, "$root|EUR");
      expect(eur?.[col("price")]).toBe(300);
      expect(eur?.[col("qty")]).toBe(20);
    });

    it("aggregates every level of a multi-level grouping", async () => {
      const { dataSource } = await createDataSource();
      dataSource.groupBy = ["ccy", "exchange"];
      dataSource.aggregations = [{ column: "price", aggType: SUM }];
      dataSource.openTreeNode("$root|USD");
      expect(groupRow(dataSource, "$root|USD")?.[col("price")]).toBe(900);
      expect(groupRow(dataSource, "$root|USD|XNYS")?.[col("price")]).toBe(300);
      expect(groupRow(dataSource, "$root|USD|XLON")?.[col("price")]).toBe(600);
    });

    it("leaves group rows empty for columns that are not grouped or aggregated", async () => {
      const { dataSource } = await createDataSource();
      dataSource.groupBy = ["ccy"];
      dataSource.aggregations = [{ column: "price", aggType: SUM }];
      const usd = groupRow(dataSource, "$root|USD");
      expect(usd?.[col("ccy")]).toBe("USD");
      expect(usd?.[col("qty")]).toBe("");
      expect(usd?.[col("trader")]).toBe("");
    });

    it("replaces and clears aggregations without losing the grouping", async () => {
      const { dataSource } = await createDataSource();
      dataSource.groupBy = ["ccy"];
      dataSource.aggregations = [{ column: "price", aggType: SUM }];
      dataSource.aggregations = [{ column: "qty", aggType: SUM }];
      let usd = groupRow(dataSource, "$root|USD");
      expect(usd?.[col("qty")]).toBe(100);
      expect(usd?.[col("price")]).toBe("");

      dataSource.aggregations = [];
      usd = groupRow(dataSource, "$root|USD");
      expect(dataSource.size).toBe(3);
      expect(usd?.[col("qty")]).toBe("");
    });

    it("keeps aggregates up to date as rows are updated, inserted and deleted", async () => {
      const { dataSource, table } = await createDataSource();
      dataSource.groupBy = ["ccy"];
      dataSource.aggregations = [
        { column: "price", aggType: SUM },
        { column: "qty", aggType: HIGH },
        { column: "id", aggType: COUNT },
      ];
      const usd = () => groupRow(dataSource, "$root|USD");

      table.update("1", "price", 150);
      expect(usd()?.[col("price")]).toBe(950);

      table.insert(["7", "USD", "XNYS", 50, 70, "dave"]);
      expect(usd()?.[col("price")]).toBe(1000);
      expect(usd()?.[col("qty")]).toBe(70);
      expect(usd()?.[col("id")]).toBe(4);

      table.delete("7");
      table.delete("6");
      expect(usd()?.[col("price")]).toBe(350);
      expect(usd()?.[col("qty")]).toBe(30);
      expect(usd()?.[col("id")]).toBe(2);
    });

    it("moves a row's contribution when its group column changes", async () => {
      const { dataSource, table } = await createDataSource();
      dataSource.groupBy = ["ccy"];
      dataSource.aggregations = [{ column: "price", aggType: SUM }];
      table.update("1", "ccy", "EUR");
      expect(groupRow(dataSource, "$root|USD")?.[col("price")]).toBe(800);
      expect(groupRow(dataSource, "$root|EUR")?.[col("price")]).toBe(450);
      expect(groupRow(dataSource, "$root|USD")?.[CHILD_COUNT]).toBe(2);
      expect(groupRow(dataSource, "$root|EUR")?.[CHILD_COUNT]).toBe(3);
    });

    it("sorts groups by an aggregated column", async () => {
      const { dataSource } = await createDataSource();
      dataSource.groupBy = ["ccy"];
      dataSource.aggregations = [{ column: "price", aggType: SUM }];
      dataSource.sort = { sortDefs: [{ column: "price", sortType: "D" }] };
      expect(keys(dataSource)).toEqual(["$root|USD", "$root|GBP", "$root|EUR"]);
      dataSource.sort = { sortDefs: [{ column: "price", sortType: "A" }] };
      expect(keys(dataSource)).toEqual(["$root|EUR", "$root|GBP", "$root|USD"]);
    });

    it("sends the subscriber group rows with updated aggregates", async () => {
      const { callback, dataSource, table } = await createDataSource();
      dataSource.groupBy = ["ccy"];
      dataSource.aggregations = [{ column: "price", aggType: SUM }];
      await nextFrame();
      callback.mockClear();
      table.update("4", "price", 450);
      await nextFrame();
      const sent = callback.mock.calls
        .map(([message]) => message)
        .filter((message) => message.type === "viewport-update")
        .flatMap((message) => message.rows ?? []);
      const gbp = sent.find((row) => row[KEY] === "$root|GBP");
      expect(gbp?.[col("price")]).toBe(450);
    });
  });

  describe("expand and collapse", () => {
    it("inserts a group's leaf rows directly below it, and removes them on close", async () => {
      const { dataSource } = await createDataSource();
      dataSource.groupBy = ["ccy"];
      expect(keys(dataSource)).toEqual(["$root|EUR", "$root|GBP", "$root|USD"]);

      dataSource.openTreeNode("$root|EUR");
      expect(dataSource.size).toBe(5);
      const [eur, first, second, gbp] = rows(dataSource);
      expect(eur[IS_EXPANDED]).toBe(true);
      expect(eur[CHILD_COUNT]).toBe(2);
      expect([first, second].every((row) => row[IS_LEAF] === true)).toBe(true);
      expect([first, second].every((row) => row[DEPTH] === 2)).toBe(true);
      expect([first[col("id")], second[col("id")]].sort()).toEqual(["2", "5"]);
      expect(gbp[KEY]).toBe("$root|GBP");

      dataSource.closeTreeNode("$root|EUR");
      expect(keys(dataSource)).toEqual(["$root|EUR", "$root|GBP", "$root|USD"]);
      expect(rows(dataSource)[0][IS_EXPANDED]).toBe(false);
    });

    it("opens and closes by row index as well as by key", async () => {
      const { dataSource } = await createDataSource();
      dataSource.groupBy = ["ccy"];
      dataSource.openTreeNode(2);
      expect(groupRow(dataSource, "$root|USD")?.[IS_EXPANDED]).toBe(true);
      expect(dataSource.size).toBe(6);
      dataSource.closeTreeNode(2);
      expect(dataSource.size).toBe(3);
    });

    it("expands nested groups level by level", async () => {
      const { dataSource } = await createDataSource();
      dataSource.groupBy = ["ccy", "exchange"];
      expect(groupRow(dataSource, "$root|USD")?.[CHILD_COUNT]).toBe(2);

      dataSource.openTreeNode("$root|USD");
      expect(keys(dataSource)).toEqual([
        "$root|EUR",
        "$root|GBP",
        "$root|USD",
        "$root|USD|XLON",
        "$root|USD|XNYS",
      ]);
      const xnys = groupRow(dataSource, "$root|USD|XNYS");
      expect(xnys?.[IS_LEAF]).toBe(false);
      expect(xnys?.[DEPTH]).toBe(2);
      expect(xnys?.[CHILD_COUNT]).toBe(2);

      dataSource.openTreeNode("$root|USD|XNYS");
      expect(dataSource.size).toBe(7);
      const leaves = rows(dataSource).slice(5);
      expect(leaves.every((row) => row[IS_LEAF] && row[DEPTH] === 3)).toBe(true);
      expect(leaves.map((row) => row[col("id")]).sort()).toEqual(["1", "3"]);
    });

    it("hides all descendants when a parent closes, and collapses them", async () => {
      const { dataSource } = await createDataSource();
      dataSource.groupBy = ["ccy", "exchange"];
      dataSource.openTreeNode("$root|USD");
      dataSource.openTreeNode("$root|USD|XNYS");
      dataSource.closeTreeNode("$root|USD");
      expect(keys(dataSource)).toEqual(["$root|EUR", "$root|GBP", "$root|USD"]);

      // current behaviour: closing a group also collapses the groups within it
      dataSource.openTreeNode("$root|USD");
      expect(dataSource.size).toBe(5);
      expect(groupRow(dataSource, "$root|USD|XNYS")?.[IS_EXPANDED]).toBe(false);
    });

    it("keeps groups expanded across sort changes and table updates", async () => {
      const { dataSource, table } = await createDataSource();
      dataSource.groupBy = ["ccy"];
      dataSource.openTreeNode("$root|USD");
      dataSource.sort = { sortDefs: [{ column: "price", sortType: "D" }] };
      const usdIndex = keys(dataSource).indexOf("$root|USD");
      expect(rows(dataSource)[usdIndex][IS_EXPANDED]).toBe(true);
      expect(
        rows(dataSource)
          .slice(usdIndex + 1, usdIndex + 4)
          .map((row) => row[col("price")]),
      ).toEqual([600, 200, 100]);

      table.insert(["7", "USD", "XNYS", 300, 70, "dave"]);
      table.insert(["8", "GBP", "XLON", 10, 80, "dave"]);
      expect(dataSource.size).toBe(7);
      expect(groupRow(dataSource, "$root|USD")?.[CHILD_COUNT]).toBe(4);
      expect(groupRow(dataSource, "$root|GBP")?.[CHILD_COUNT]).toBe(2);
      expect(keys(dataSource)).toContain("$root|USD|7");
      expect(keys(dataSource)).not.toContain("$root|GBP|8");
    });

    it("collapses everything when the groupBy changes", async () => {
      const { dataSource } = await createDataSource();
      dataSource.groupBy = ["ccy", "exchange"];
      dataSource.openTreeNode("$root|USD");
      dataSource.groupBy = ["ccy"];
      expect(dataSource.size).toBe(3);
      expect(rows(dataSource).every((row) => row[IS_EXPANDED] === false)).toBe(
        true,
      );

      dataSource.openTreeNode("$root|USD");
      dataSource.groupBy = [];
      dataSource.groupBy = ["ccy"];
      expect(dataSource.size).toBe(3);
    });

    it("ignores keys that are not in the tree", async () => {
      const { dataSource } = await createDataSource();
      dataSource.groupBy = ["ccy"];
      dataSource.openTreeNode("$root|CHF");
      dataSource.closeTreeNode("$root|CHF");
      expect(dataSource.size).toBe(3);
    });

    it("notifies the subscriber of the new size and rows", async () => {
      const { callback, dataSource } = await createDataSource();
      dataSource.groupBy = ["ccy"];
      await nextFrame();
      const onResize = vi.fn();
      dataSource.on("resize", onResize);
      callback.mockClear();

      dataSource.openTreeNode("$root|USD");
      await nextFrame();
      expect(onResize.mock.lastCall?.[0]).toBe(6);
      const sentKeys = callback.mock.calls
        .map(([message]) => message)
        .filter((message) => message.type === "viewport-update")
        .flatMap((message) => message.rows ?? [])
        .map((row) => row[KEY]);
      expect(sentKeys).toEqual(
        expect.arrayContaining(["$root|USD|1", "$root|USD|3", "$root|USD|6"]),
      );

      dataSource.closeTreeNode("$root|USD");
      await nextFrame();
      expect(onResize.mock.lastCall?.[0]).toBe(3);
    });
  });
});
