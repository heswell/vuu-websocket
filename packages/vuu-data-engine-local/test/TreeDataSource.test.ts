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
    { name: "parentId", serverDataType: "string" },
    { name: "name", serverDataType: "string" },
    { name: "limit", serverDataType: "int" },
  ],
  key: "id",
  table: { module: "TEST", table: "limits" },
};

const createTable = () =>
  new Table(
    schema,
    [
      ["firm", "", "Firm", 100],
      ["le1", "firm", "Legal entity 1", 50],
      ["desk1", "le1", "Desk 1", 20],
      ["le2", "firm", "Legal entity 2", 70],
    ],
    buildDataColumnMapFromSchema(schema),
  );

const createDataSource = async (openDepth?: number) => {
  const table = createTable();
  const dataSource = new EngineDataSource({
    columnDescriptors: schema.columns,
    table,
    tree: { parentColumn: "parentId", openDepth },
  });
  const callback = vi.fn<DataSourceSubscribeCallback>();
  await dataSource.subscribe({ range: Range(0, 20) }, callback);
  return { callback, dataSource, table };
};

const summary = (dataSource: EngineDataSource) => {
  const result: string[] = [];
  for (let i = 0; i < dataSource.size; i++) {
    const row = dataSource.getRowAtIndex(i);
    if (row) {
      const state = row[IS_LEAF]
        ? "leaf"
        : row[IS_EXPANDED]
          ? "open"
          : "closed";
      result.push(`${row[KEY]} d${row[DEPTH]} c${row[CHILD_COUNT]} ${state}`);
    }
  }
  return result;
};

const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("EngineDataSource parent-key tree", () => {
  it("rows carry tree metadata and the table key", async () => {
    const { dataSource } = await createDataSource(1);
    expect(summary(dataSource)).toEqual([
      "firm d1 c2 open",
      "le1 d2 c1 closed",
      "le2 d2 c0 leaf",
    ]);
    expect(dataSource.getRowAtIndex(1)?.slice(DATA)).toEqual([
      "le1",
      "firm",
      "Legal entity 1",
      50,
    ]);
  });

  it("opens and closes rows by key or index", async () => {
    const { dataSource } = await createDataSource();
    dataSource.openTreeNode("firm");
    expect(summary(dataSource)).toEqual([
      "firm d1 c2 open",
      "le1 d2 c1 closed",
      "le2 d2 c0 leaf",
    ]);
    dataSource.openTreeNode(1);
    expect(dataSource.size).toBe(4);
    dataSource.closeTreeNode(0);
    expect(summary(dataSource)).toEqual(["firm d1 c2 closed"]);
  });

  it("a config change keeps the tree; removing it makes the rows flat", async () => {
    const { dataSource } = await createDataSource(1);
    dataSource.config = {
      ...dataSource.config,
      sort: { sortDefs: [{ column: "limit", sortType: "D" }] },
    };
    await nextFrame();
    expect(summary(dataSource)).toEqual([
      "firm d1 c2 open",
      "le2 d2 c0 leaf",
      "le1 d2 c1 closed",
    ]);
    dataSource.config = { ...dataSource.config, tree: undefined } as never;
    await nextFrame();
    expect(dataSource.size).toBe(4);
    expect(dataSource.getRowAtIndex(0)?.[DEPTH]).toBe(0);
  });

  it("a tree can be added by config", async () => {
    const dataSource = new EngineDataSource({
      columnDescriptors: schema.columns,
      table: createTable(),
    });
    await dataSource.subscribe(
      { range: Range(0, 20) },
      vi.fn<DataSourceSubscribeCallback>(),
    );
    expect(dataSource.size).toBe(4);
    dataSource.config = {
      ...dataSource.config,
      tree: { parentColumn: "parentId" },
    } as never;
    await nextFrame();
    expect(summary(dataSource)).toEqual(["firm d1 c2 closed"]);
  });
});
