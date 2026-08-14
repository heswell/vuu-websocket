import { describe, expect, test } from "bun:test";
import {
  Columns,
  CreateSessionTableRpcHandler,
  EditSessionRpcHandler,
  type DataTable,
} from "@heswell/vuu-server";
import { TableDef } from "../src/api/TableDef";
import { InMemDataTable } from "../src/core/table/InMemDataTable";
import { InMemSessionDataTable } from "../src/core/table/InMemSessionDataTable";
import { TableContainer } from "../src/core/table/TableContainer";
import { JoinTableProvider } from "../src/provider/JoinTableProvider";
import type { RpcParams } from "../src/net/rpc/Rpc";
import type { ViewServerModule } from "../src/core/module/VsModule";
import type { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

describe("session table editing", () => {
  test("creates session tables for new and legacy copy options", () => {
    const { baseTable, handler, tableContainer } = testContext();

    const allResult = call(handler, "createSessionTable", baseTable, {
      copyOption: "All",
    });
    const allTable = sessionTableFromResult(tableContainer, allResult);
    expect(allTable.rows).toHaveLength(2);
    expect(allTable.schema.columns.at(-1)?.name).toBe("vuu_action");
    expect(allTable.rows.map((row) => row[allTable.columnMap.vuu_action])).toEqual([
      "",
      "",
    ]);

    const selectedResult = call(
      handler,
      "createSessionTable",
      baseTable,
      { copyOption: "Selected" },
      new Set(["B"]),
    );
    const selectedTable = sessionTableFromResult(
      tableContainer,
      selectedResult,
    );
    expect(selectedTable.rows.map((row) => row[0])).toEqual(["B"]);

    const legacyHandler = new EditSessionRpcHandler(tableContainer);
    const emptyResult = call(legacyHandler, "beginEditSession", baseTable, {
      editSessionMode: "empty-session-table",
    });
    expect(sessionTableFromResult(tableContainer, emptyResult).rows).toEqual([]);
  });

  test("adds, deletes, and undoes session rows", () => {
    const { baseTable, handler, tableContainer } = testContext();
    const sessionTable = createSessionTable(
      handler,
      tableContainer,
      baseTable,
    );

    const suppliedKeyResult = call(handler, "addRow", sessionTable, {
      key: "C",
      data: { name: "Gamma" },
    });
    expect(suppliedKeyResult).toEqual({
      type: "SUCCESS_RESULT",
      data: { key: "C" },
    });
    expect(action(sessionTable, "C")).toBe("addRow");

    call(handler, "deleteRow", sessionTable, { key: "C" });
    expect(sessionTable.getRowAtKey("C", false)).toBeUndefined();

    const generatedKeyResult = call(handler, "addRow", sessionTable, {
      data: { name: "Generated" },
    });
    const generatedKey = (
      generatedKeyResult.data as { key: string }
    ).key;
    expect(generatedKey).toBeString();
    expect(action(sessionTable, generatedKey)).toBe("addRow");
    call(handler, "undoRowChange", sessionTable, { key: generatedKey });
    expect(sessionTable.getRowAtKey(generatedKey, false)).toBeUndefined();

    call(
      handler,
      "deleteSelectedRows",
      sessionTable,
      {},
      new Set(["A", "B"]),
    );
    expect(action(sessionTable, "A")).toBe("deleteRow");
    expect(action(sessionTable, "B")).toBe("deleteRow");

    call(handler, "undoRowChange", sessionTable, { key: "A" });
    expect(action(sessionTable, "A")).toBe("");
    expect(sessionTable.getRowAtKey("A")[1]).toBe("Alpha");
  });

  test("rejects addRow keys that already exist outside the session copy", () => {
    const { baseTable, handler, tableContainer } = testContext();
    const emptyTable = sessionTableFromResult(
      tableContainer,
      call(handler, "createSessionTable", baseTable, { copyOption: "Empty" }),
    );

    expect(
      call(handler, "addRow", emptyTable, {
        key: "A",
        data: { name: "Duplicate" },
      }),
    ).toEqual({
      type: "ERROR_RESULT",
      errorMessage: "addRow: row A already exists in source table",
    });
    expect(emptyTable.rows).toEqual([]);
  });

  test("keeps vuu_action server controlled", () => {
    const { baseTable, handler, tableContainer } = testContext();
    const sessionTable = createSessionTable(
      handler,
      tableContainer,
      baseTable,
    );

    expect(
      call(handler, "editCell", sessionTable, {
        column: "vuu_action",
        data: "addRow",
        key: "A",
      }),
    ).toEqual({
      type: "ERROR_RESULT",
      errorMessage: "editCell: vuu_action is server controlled",
    });
    expect(action(sessionTable, "A")).toBe("");
  });

  test("commits added, deleted, and edited rows", () => {
    const { baseTable, handler, tableContainer } = testContext();
    const sessionTable = createSessionTable(
      handler,
      tableContainer,
      baseTable,
    );

    call(handler, "editCell", sessionTable, {
      column: "name",
      data: "Alpha edited",
      key: "A",
    });
    call(handler, "addRow", sessionTable, {
      key: "C",
      data: { name: "Gamma" },
    });
    call(handler, "deleteRow", sessionTable, { key: "B" });

    expect(
      call(handler, "endEditSession", sessionTable, {
        save: true,
      }),
    ).toEqual({ type: "SUCCESS_RESULT", data: undefined });

    expect(baseTable.getRowAtKey("A")[1]).toBe("Alpha edited");
    expect(baseTable.getRowAtKey("B", false)).toBeUndefined();
    expect(baseTable.getRowAtKey("C")[1]).toBe("Gamma");
    expect(() => tableContainer.getTable(sessionTable.name)).toThrow();
  });

  test("discards a cancelled session", () => {
    const { baseTable, handler, tableContainer } = testContext();
    const sessionTable = createSessionTable(
      handler,
      tableContainer,
      baseTable,
    );

    call(handler, "deleteRow", sessionTable, { key: "A" });
    call(handler, "endEditSession", sessionTable, { save: false });

    expect(baseTable.getRowAtKey("A")[1]).toBe("Alpha");
    expect(() => tableContainer.getTable(sessionTable.name)).toThrow();
  });

  test("does not apply row actions when an edited row is stale", () => {
    const { baseTable, handler, tableContainer } = testContext();
    const sessionTable = createSessionTable(
      handler,
      tableContainer,
      baseTable,
    );

    call(handler, "editCell", sessionTable, {
      column: "name",
      data: "Alpha edited",
      key: "A",
    });
    call(handler, "addRow", sessionTable, {
      key: "C",
      data: { name: "Gamma" },
    });

    const sourceRow = baseTable.getRowAtKey("A").slice();
    sourceRow[baseTable.columnMap.vuuUpdatedTimestamp] = 101;
    baseTable.update(baseTable.rowIndexAtKey("A"), sourceRow);

    expect(
      call(handler, "endEditSession", sessionTable, { save: true }),
    ).toEqual({ type: "ERROR_RESULT", errorMessage: "stale update" });
    expect(baseTable.getRowAtKey("A")[1]).toBe("Alpha");
    expect(baseTable.getRowAtKey("C", false)).toBeUndefined();
  });

  test("rejects an added key that appears in the source before save", () => {
    const { baseTable, handler, tableContainer } = testContext();
    const sessionTable = createSessionTable(
      handler,
      tableContainer,
      baseTable,
    );

    call(handler, "addRow", sessionTable, {
      key: "C",
      data: { name: "Session Gamma" },
    });
    baseTable.insert(sourceRow("C", "Concurrent Gamma", 300));

    expect(
      call(handler, "endEditSession", sessionTable, { save: true }),
    ).toEqual({
      type: "ERROR_RESULT",
      errorMessage: "duplicate key",
    });
    expect(baseTable.rows.filter((row) => row[0] === "C")).toHaveLength(1);
    expect(baseTable.getRowAtKey("C")[1]).toBe("Concurrent Gamma");
  });

  test("rejects edits when the source row disappears before save", () => {
    const { baseTable, handler, tableContainer } = testContext();
    const sessionTable = createSessionTable(
      handler,
      tableContainer,
      baseTable,
    );

    call(handler, "editCell", sessionTable, {
      column: "name",
      data: "Alpha edited",
      key: "A",
    });
    baseTable.delete("A");

    expect(
      call(handler, "endEditSession", sessionTable, { save: true }),
    ).toEqual({ type: "ERROR_RESULT", errorMessage: "stale update" });
    expect(sessionTable.getRowAtKey("A")[sessionTable.columnMap.vuuMsg]).toBe(
      "editRow:A:source row missing",
    );
  });
});

function testContext() {
  const joinProvider = new JoinTableProvider();
  const tableContainer = new TableContainer(joinProvider);
  const tableDef = TableDef({
    name: "items",
    keyField: "id",
    columns: Columns.fromNames(
      "id:string",
      "name:string",
      "vuuCreatedTimestamp:epochtimestamp",
      "vuuUpdatedTimestamp:epochtimestamp",
      "vuuMsg:string",
    ),
  });
  tableDef.setModule({ name: "TEST" } as ViewServerModule);
  const baseTable = new InMemDataTable(tableDef, joinProvider);
  baseTable.insert(sourceRow("A", "Alpha", 100));
  baseTable.insert(sourceRow("B", "Beta", 200));
  tableContainer.addTable(baseTable);

  return {
    baseTable,
    handler: new CreateSessionTableRpcHandler(tableContainer),
    tableContainer,
  };
}

function sourceRow(key: string, name: string, timestamp: number): VuuDataRow {
  return [key, name, timestamp, timestamp, ""];
}

function createSessionTable(
  handler: CreateSessionTableRpcHandler,
  tableContainer: TableContainer,
  baseTable: DataTable,
) {
  return sessionTableFromResult(
    tableContainer,
    call(handler, "createSessionTable", baseTable, { copyOption: "All" }),
  );
}

function sessionTableFromResult(
  tableContainer: TableContainer,
  result: ReturnType<typeof call>,
) {
  if (result.type === "ERROR_RESULT") {
    throw Error(result.errorMessage);
  }
  const { table } = result.data as {
    table: { module: string; table: string };
  };
  return tableContainer.getTable<InMemSessionDataTable>(table.table);
}

function action(sessionTable: InMemSessionDataTable, key: string) {
  return sessionTable.getRowAtKey(key)[sessionTable.columnMap.vuu_action];
}

function call(
  handler: CreateSessionTableRpcHandler,
  rpcName: string,
  dataTable: DataTable,
  namedParams: Record<string, unknown>,
  selectedKeys = new Set<string>(),
) {
  return handler.processRpcRequest(rpcName, {
    namedParams,
    viewport: { dataTable, selectedKeys },
    ctx: { session: { sessionId: "test-session" } },
  } as RpcParams);
}
