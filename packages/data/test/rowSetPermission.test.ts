import { describe, expect, test } from "bun:test";
import { Table } from "../src";
import { TableSchema } from "@vuu-ui/vuu-data-types";
import { RowSet } from "../src/store/rowset";
import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

const schema: TableSchema = {
  columns: [
    { name: "id", serverDataType: "string" },
    { name: "audience", serverDataType: "string" },
    { name: "priority", serverDataType: "int" },
  ],
  key: "id",
  table: { module: "TEST", table: "permissions" },
};

const AUDIENCE = 1;

const createTable = () => {
  const table = new Table({ schema });
  [
    ["n1", "all", 3],
    ["n2", "admin", 1],
    ["n3", "steve", 2],
    ["n4", "admin", 5],
    ["n5", "all", 4],
  ].forEach((row) => table.insert(row, false));
  return table;
};

const notAdmin = (row: VuuDataRow) => row[AUDIENCE] !== "admin";

const keys = (rowSet: RowSet) =>
  rowSet.slice(0, rowSet.size).map((row) => row.rowKey);

let lastUpdateResponse: ReturnType<RowSet["update"]>;

const createRowSet = (table: Table) => {
  const rowSet = new RowSet("vp-1", table, ["id", "audience", "priority"], {
    permissionFilter: notAdmin,
    range: { from: 0, to: 10 },
  });
  table.on("rowInserted", (idx, row) => rowSet.insert(idx, row));
  table.on("rowDeleted", (idx, row) => rowSet.delete(idx, row));
  table.on("rowUpdated", (idx, row) => {
    lastUpdateResponse = rowSet.update(idx, row);
  });
  return rowSet;
};

describe("RowSet permissionFilter", () => {
  test("restricts visible rows", () => {
    const rowSet = createRowSet(createTable());
    expect(rowSet.size).toEqual(3);
    expect(keys(rowSet)).toEqual(["n1", "n3", "n5"]);
  });

  test("can be applied after construction and removed", () => {
    const table = createTable();
    const rowSet = new RowSet("vp-1", table, ["id"], {
      range: { from: 0, to: 10 },
    });
    expect(rowSet.size).toEqual(5);
    rowSet.setPermissionFilter(notAdmin);
    expect(rowSet.size).toEqual(3);
    rowSet.setPermissionFilter(undefined);
    expect(rowSet.size).toEqual(5);
  });

  test("is combined with client filter, survives clearFilter", () => {
    const rowSet = createRowSet(createTable());
    rowSet.filter({ column: "audience", op: "=", value: "all" });
    expect(keys(rowSet)).toEqual(["n1", "n5"]);
    rowSet.filter({ column: "priority", op: ">", value: 0 });
    expect(keys(rowSet)).toEqual(["n1", "n3", "n5"]);
    rowSet.clearFilter();
    expect(keys(rowSet)).toEqual(["n1", "n3", "n5"]);
  });

  test("is applied after sort", () => {
    const rowSet = createRowSet(createTable());
    rowSet.sort([{ column: "priority", sortType: "D" }]);
    expect(keys(rowSet)).toEqual(["n5", "n1", "n3"]);
  });

  test("applies to inserted rows", () => {
    const table = createTable();
    const rowSet = createRowSet(table);
    table.insert(["n6", "admin", 1]);
    expect(rowSet.size).toEqual(3);
    table.insert(["n7", "all", 1]);
    expect(keys(rowSet)).toEqual(["n1", "n3", "n5", "n7"]);
  });

  test("inserts into sorted rowset", () => {
    const table = createTable();
    const rowSet = createRowSet(table);
    rowSet.sort([{ column: "priority", sortType: "D" }]);
    table.insert(["n7", "all", 10]);
    table.insert(["n8", "admin", 10]);
    expect(keys(rowSet)).toEqual(["n7", "n5", "n1", "n3"]);
  });

  test("handles deleted rows", () => {
    const table = createTable();
    const rowSet = createRowSet(table);
    table.delete("n2");
    expect(keys(rowSet)).toEqual(["n1", "n3", "n5"]);
    table.delete("n3");
    expect(keys(rowSet)).toEqual(["n1", "n5"]);
    // selection relies on keyMap being correct after delete
    rowSet.selectRow("n5", false);
    expect(rowSet.selectedKeys.has("n5")).toBe(true);
  });

  test("updates can move rows in and out of view", () => {
    const table = createTable();
    const rowSet = createRowSet(table);
    table.upsert(["n1", "admin", 3]);
    expect(lastUpdateResponse?.sizeMessageRequired).toBe(true);
    expect(keys(rowSet)).toEqual(["n3", "n5"]);

    table.upsert(["n3", "steve", 7]);
    expect(lastUpdateResponse?.sizeMessageRequired).toBeUndefined();

    table.upsert(["n2", "all", 1]);
    expect(keys(rowSet)).toEqual(["n2", "n3", "n5"]);
  });
});
