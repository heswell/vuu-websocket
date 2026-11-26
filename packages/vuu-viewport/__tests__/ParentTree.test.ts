import { describe, expect, test } from "bun:test";
import { Table, type TableSchema } from "@heswell/vuu-table";
import type { VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import {
  InMemoryViewport,
  type ViewportBatch,
  type ViewportOptions,
} from "../src/index.ts";

const schema: TableSchema = {
  table: { module: "TEST", table: "limits" },
  key: "id",
  columns: [
    { name: "id", serverDataType: "string" },
    { name: "parentId", serverDataType: "string" },
    { name: "name", serverDataType: "string" },
    { name: "limit", serverDataType: "int" },
  ],
};

// firm
//   le1
//     desk1
//       book1
//     desk2
//   le2
const createTable = () => {
  const table = new Table(schema);
  table.insert(["firm", "", "Firm", 100]);
  table.insert(["le1", "firm", "Legal entity 1", 50]);
  table.insert(["desk1", "le1", "Desk 1", 20]);
  table.insert(["book1", "desk1", "Book 1", 5]);
  table.insert(["desk2", "le1", "Desk 2", 30]);
  table.insert(["le2", "firm", "Legal entity 2", 70]);
  return table;
};

/** Accumulates batches, as a client would */
class ClientModel {
  rows = new Map<number, { key: string; data: VuuRowDataItemType[] }>();
  size = 0;
  apply({ size, rows }: ViewportBatch) {
    this.size = size;
    for (const row of rows) {
      this.rows.set(row.rowIndex, { key: row.rowKey, data: row.data });
    }
    for (const idx of this.rows.keys()) if (idx >= size) this.rows.delete(idx);
    return this;
  }
  get keys() {
    const keys: string[] = [];
    for (let i = 0; i < this.size; i++) keys.push(this.rows.get(i)!.key);
    return keys;
  }
  /** key, depth, and open / closed / leaf, per row */
  get summary() {
    const summary: string[] = [];
    for (let i = 0; i < this.size; i++) {
      const { key, data } = this.rows.get(i)!;
      const [depth, isExpanded, , isLeaf, , childCount] = data;
      const state = isLeaf ? "leaf" : isExpanded ? "open" : "closed";
      summary.push(`${key} d${depth} c${childCount} ${state}`);
    }
    return summary;
  }
}

const createViewport = (
  options: Partial<ViewportOptions> = {},
  table = createTable(),
) => {
  const vp = new InMemoryViewport(table, {
    id: "vp1",
    columns: ["name", "limit"],
    range: { from: 0, to: 100 },
    tree: { parentColumn: "parentId" },
    ...options,
  });
  const client = new ClientModel().apply(vp.getCurrentRange());
  return { client, table, vp };
};

describe("InMemoryViewport parent-key tree", () => {
  test("shows the roots, collapsed, by default", () => {
    const { client, vp } = createViewport();
    expect(vp.size).toBe(1);
    expect(client.rows.get(0)).toEqual({
      key: "firm",
      data: [1, false, "firm", false, "firm", 2, "Firm", 100],
    });
  });

  test("expands rows within openDepth, depth first", () => {
    const { client } = createViewport({
      tree: { parentColumn: "parentId", openDepth: 2 },
    });
    expect(client.summary).toEqual([
      "firm d1 c2 open",
      "le1 d2 c2 open",
      "desk1 d3 c1 closed",
      "desk2 d3 c0 leaf",
      "le2 d2 c0 leaf",
    ]);
  });

  test("opens a row, and closing it closes every row below", () => {
    const { client, vp } = createViewport();
    client.apply(vp.openTreeNode("firm"));
    expect(client.keys).toEqual(["firm", "le1", "le2"]);
    client.apply(vp.openTreeNode("le1"));
    client.apply(vp.openTreeNode("desk1"));
    expect(client.keys).toEqual([
      "firm",
      "le1",
      "desk1",
      "book1",
      "desk2",
      "le2",
    ]);
    client.apply(vp.closeTreeNode("firm"));
    expect(client.summary).toEqual(["firm d1 c2 closed"]);
    client.apply(vp.openTreeNode("firm"));
    expect(client.summary).toEqual([
      "firm d1 c2 open",
      "le1 d2 c2 closed",
      "le2 d2 c0 leaf",
    ]);
  });

  test("opening or closing a leaf changes nothing", () => {
    const { client, vp } = createViewport({
      tree: { parentColumn: "parentId", openDepth: 1 },
    });
    expect(vp.closeTreeNode("le2").rows).toEqual([]);
    expect(vp.openTreeNode("le2").rows).toEqual([]);
    expect(client.keys).toEqual(["firm", "le1", "le2"]);
  });

  test("makes a root of a row whose parent is missing, empty or in a cycle", () => {
    const table = new Table(schema);
    table.insert(["a", "missing", "A", 1]);
    table.insert(["b", null, "B", 1]);
    table.insert(["x", "y", "X", 1]);
    table.insert(["y", "x", "Y", 1]);
    table.insert(["z", "y", "Z", 1]);
    const { client } = createViewport(
      { tree: { parentColumn: "parentId", openDepth: 9 } },
      table,
    );
    expect(client.summary).toEqual([
      "a d1 c0 leaf",
      "b d1 c0 leaf",
      "x d1 c0 leaf",
      "y d1 c1 open",
      "z d2 c0 leaf",
    ]);
  });

  test("sorts among siblings", () => {
    const { client, vp } = createViewport({
      tree: { parentColumn: "parentId", openDepth: 9 },
    });
    client.apply(
      vp.setConfig({
        sort: { sortDefs: [{ column: "limit", sortType: "D" }] },
      }),
    );
    expect(client.keys).toEqual([
      "firm",
      "le2",
      "le1",
      "desk2",
      "desk1",
      "book1",
    ]);
  });

  test("shows filter matches with their ancestors, expanded, and restores expanded state when cleared", () => {
    const { client, vp } = createViewport();
    client.apply(vp.setConfig({ filterSpec: { filter: 'name = "Book 1"' } }));
    expect(client.summary).toEqual([
      "firm d1 c1 open",
      "le1 d2 c1 open",
      "desk1 d3 c1 open",
      "book1 d4 c0 leaf",
    ]);
    client.apply(vp.closeTreeNode("le1"));
    expect(client.keys).toEqual(["firm", "le1"]);
    client.apply(vp.setConfig({ filterSpec: { filter: "" } }));
    expect(client.summary).toEqual(["firm d1 c2 closed"]);
  });

  test("a base filter removes rows before the tree is built", () => {
    const { client, vp } = createViewport({
      tree: { parentColumn: "parentId", openDepth: 9 },
    });
    client.apply(vp.setBaseFilter({ filter: 'id != "le1"' }));
    expect(client.summary).toEqual([
      "firm d1 c1 open",
      "le2 d2 c0 leaf",
      "desk1 d1 c1 open",
      "book1 d2 c0 leaf",
      "desk2 d1 c0 leaf",
    ]);
  });

  test("sends a changed value without moving the row", () => {
    const { client, table, vp } = createViewport({
      tree: { parentColumn: "parentId", openDepth: 9 },
    });
    table.updateByKey("desk1", { limit: 25 });
    const batch = vp.flush();
    expect(batch.rows.map((row) => row.rowKey)).toEqual(["desk1"]);
    client.apply(batch);
    expect(client.rows.get(2)!.data).toEqual([
      3,
      true,
      "desk1",
      false,
      "desk1",
      1,
      "Desk 1",
      25,
    ]);
  });

  test("moves a row with its subtree when its parent changes", () => {
    const { client, table, vp } = createViewport({
      tree: { parentColumn: "parentId", openDepth: 9 },
    });
    table.updateByKey("desk1", { parentId: "le2" });
    client.apply(vp.flush());
    expect(client.summary).toEqual([
      "firm d1 c2 open",
      "le1 d2 c1 open",
      "desk2 d3 c0 leaf",
      "le2 d2 c1 open",
      "desk1 d3 c1 open",
      "book1 d4 c0 leaf",
    ]);
  });

  test("an inserted row goes under its parent, or is counted when the parent is closed", () => {
    const { client, table, vp } = createViewport({
      tree: { parentColumn: "parentId", openDepth: 1 },
    });
    table.insert(["le3", "firm", "Legal entity 3", 10]);
    table.insert(["desk3", "le2", "Desk 3", 10]);
    client.apply(vp.flush());
    expect(client.summary).toEqual([
      "firm d1 c3 open",
      "le1 d2 c2 closed",
      "le2 d2 c1 closed",
      "le3 d2 c0 leaf",
    ]);
  });

  test("deleting a row makes its children roots and drops its expanded state", () => {
    const { client, table, vp } = createViewport({
      tree: { parentColumn: "parentId", openDepth: 9 },
    });
    table.delete("le1");
    client.apply(vp.flush());
    expect(client.summary).toEqual([
      "firm d1 c1 open",
      "le2 d2 c0 leaf",
      "desk1 d1 c1 open",
      "book1 d2 c0 leaf",
      "desk2 d1 c0 leaf",
    ]);
    // re-inserted, le1 is new to the tree, so openDepth applies again
    table.insert(["le1", "firm", "Legal entity 1", 50]);
    client.apply(vp.flush());
    expect(client.keys).toEqual([
      "firm",
      "le2",
      "le1",
      "desk1",
      "book1",
      "desk2",
    ]);
  });

  test("selection is by table key; a selected parent stands for itself", () => {
    const { vp } = createViewport({
      tree: { parentColumn: "parentId", openDepth: 9 },
    });
    vp.selectRow("le1", false);
    expect(vp.getSelectedRowKeys()).toEqual(["le1"]);
    expect(vp.rowIndexAt(1)).toBe(vp.table.rowIndexAtKey("le1"));
    vp.selectRowRange("le1", "desk2", false);
    expect(vp.getSelectedRowKeys().sort()).toEqual([
      "book1",
      "desk1",
      "desk2",
      "le1",
    ]);
  });

  test("tree cannot be combined with groupBy or aggregations", () => {
    expect(() => createViewport({ groupBy: ["parentId"] })).toThrow(/groupBy/);
    const { vp } = createViewport();
    expect(() => vp.setConfig({ groupBy: ["parentId"] })).toThrow(/groupBy/);
    expect(() =>
      vp.setConfig({ aggregations: [{ column: "limit", aggType: 1 }] }),
    ).toThrow(/aggregations/);
  });

  test("a config change without tree keeps it; tree: undefined removes it", () => {
    const { client, vp } = createViewport();
    client.apply(vp.setConfig({ columns: ["name"] }));
    expect(client.summary).toEqual(["firm d1 c2 closed"]);
    client.apply(vp.setConfig({ tree: undefined }));
    expect(vp.size).toBe(6);
    expect(client.rows.get(0)).toEqual({ key: "firm", data: ["Firm"] });
  });

  test("a changed tree resets expanded state", () => {
    const { client, vp } = createViewport();
    client.apply(vp.openTreeNode("firm"));
    client.apply(
      vp.setConfig({ tree: { parentColumn: "parentId", openDepth: 0 } }),
    );
    expect(client.keys).toEqual(["firm", "le1", "le2"]);
    client.apply(
      vp.setConfig({ tree: { parentColumn: "parentId", openDepth: 1 } }),
    );
    expect(client.summary).toEqual([
      "firm d1 c2 open",
      "le1 d2 c2 closed",
      "le2 d2 c0 leaf",
    ]);
    client.apply(vp.closeTreeNode("firm"));
    client.apply(vp.setConfig({ tree: { parentColumn: "parentId" } }));
    expect(client.keys).toEqual(["firm"]);
  });
});
