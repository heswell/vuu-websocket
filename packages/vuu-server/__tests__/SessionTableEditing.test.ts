import { describe, expect, test } from "bun:test";
import {
  Columns,
  CreateSessionTableRpcHandler,
  EditSessionRpcHandler,
  type DataTable,
} from "@heswell/vuu-server";
import { SessionTableDef, TableDef } from "../src/api/TableDef";
import { InMemDataTable } from "../src/core/table/InMemDataTable";
import { InMemSessionDataTable } from "../src/core/table/InMemSessionDataTable";
import { TableContainer } from "../src/core/table/TableContainer";
import { JoinTableProvider } from "../src/provider/JoinTableProvider";
import type { RpcParams } from "../src/net/rpc/Rpc";
import type { ViewServerModule } from "../src/core/module/VsModule";
import type {
  VuuDataRow,
  VuuRowDataItemType,
} from "@vuu-ui/vuu-protocol-types";
import { ViewPortDef } from "../src/api/ViewPortDef";
import { ViewportContainer } from "../src/viewport/ViewportContainer";
import type { ProviderContainer } from "../src/provider/ProviderContainer";

describe("session table editing", () => {
  test("creates session tables for new and legacy copy options", () => {
    const { baseTable, handler, tableContainer } = testContext();

    const allResult = call(handler, "createSessionTable", baseTable, {
      copyOption: "All",
      sessionType: "edit",
    });
    const allTable = sessionTableFromResult(tableContainer, allResult);
    const allTableName = allTable.name;
    expect(allTable.rows).toHaveLength(2);
    expect(allTable.schema.columns.at(-1)).toEqual({
      name: "vuuAction",
      serverDataType: "string",
    });
    expect(allTable.rows.map((row) => row[allTable.columnMap.vuuAction])).toEqual([
      "",
      "",
    ]);

    const selectedResult = call(
      handler,
      "createSessionTable",
      baseTable,
      { copyOption: "Selected", sessionType: "edit" },
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
    expect(tableContainer.getDefinedTables()).toEqual(DEFINED_TABLES);

    tableContainer.removeSessionTables({
      sessionId: "test-session",
      channelId: "test-channel",
    });
    expect(() => tableContainer.getTable(allTableName)).toThrow(
      `[TableContainer] no table ${allTableName}`,
    );
    expect(tableContainer.getDefinedTables()).toEqual(DEFINED_TABLES);
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
      call(handler, "createSessionTable", baseTable, {
        copyOption: "Empty",
        sessionType: "edit",
      }),
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

  test("keeps vuuAction server controlled", () => {
    const { baseTable, handler, tableContainer } = testContext();
    const sessionTable = createSessionTable(
      handler,
      tableContainer,
      baseTable,
    );

    expect(
      call(handler, "editCell", sessionTable, {
        column: "vuuAction",
        data: "addRow",
        key: "A",
      }),
    ).toEqual({
      type: "ERROR_RESULT",
      errorMessage: "editCell: vuuAction is server controlled",
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

describe("session table blueprints", () => {
  const error = (errorMessage: string) => ({
    type: "ERROR_RESULT",
    errorMessage,
  });

  test("sessionType is required", () => {
    const { baseTable, handler } = testContext();
    expect(
      call(handler, "createSessionTable", baseTable, { copyOption: "All" }),
    ).toEqual(error("Session type undefined"));
    expect(
      call(handler, "createSessionTable", baseTable, {
        copyOption: "All",
        sessionType: "update",
      }),
    ).toEqual(error("Session type undefined"));
  });

  test("fails when no blueprint is registered, there is no fallback", () => {
    const { baseTable, handler, tableContainer } = testContext();
    expect(
      call(handler, "createSessionTable", baseTable, {
        copyOption: "All",
        sessionType: "export",
      }),
    ).toEqual(error("session table export-items is not defined"));
    expect(
      call(handler, "createSessionTable", baseTable, {
        copyOption: "All",
        sessionType: "edit",
        sessionTableName: "missing",
      }),
    ).toEqual(error("session table missing is not defined"));
    // a regular table cannot be used as a blueprint
    expect(
      call(handler, "createSessionTable", baseTable, {
        copyOption: "All",
        sessionType: "edit",
        sessionTableName: "items",
      }),
    ).toEqual(error("session table items is not defined"));
    expect(
      tableContainer
        .getDefinedTables()
        .filter(({ table }) => table.startsWith("session:")),
    ).toEqual([]);
  });

  test("a session table instance cannot be used as a blueprint", () => {
    const { baseTable, handler, tableContainer } = testContext();
    const sessionTable = createSessionTable(handler, tableContainer, baseTable);
    expect(
      call(handler, "createSessionTable", baseTable, {
        copyOption: "All",
        sessionType: "edit",
        sessionTableName: sessionTable.name,
      }),
    ).toEqual(error(`session table ${sessionTable.name} is not defined`));
  });

  test("edit and import require an editable source table, export does not", () => {
    const { addBlueprint, baseTable, handler, tableContainer } = testContext({
      editable: false,
    });
    addBlueprint("export-items");
    for (const sessionType of ["edit", "import"]) {
      expect(
        call(handler, "createSessionTable", baseTable, {
          copyOption: "All",
          sessionType,
        }),
      ).toEqual(error("Table not editable"));
    }
    const exportTable = sessionTableFromResult(
      tableContainer,
      call(handler, "createSessionTable", baseTable, {
        copyOption: "All",
        sessionType: "export",
      }),
    );
    expect(exportTable.name).toContain("/simple-export-items_");
    expect(exportTable.rows).toHaveLength(2);
  });

  test("edit and export require a copyOption, import is always empty", () => {
    const { addBlueprint, baseTable, handler, tableContainer } = testContext();
    addBlueprint("import-items");
    expect(
      call(handler, "createSessionTable", baseTable, { sessionType: "edit" }),
    ).toEqual(error("Missing or invalid copy option."));
    expect(
      call(handler, "createSessionTable", baseTable, {
        copyOption: "Some",
        sessionType: "edit",
      }),
    ).toEqual(error("Missing or invalid copy option."));
    const importTable = sessionTableFromResult(
      tableContainer,
      call(handler, "createSessionTable", baseTable, {
        copyOption: "All",
        sessionType: "import",
      }),
    );
    expect(importTable.name).toContain("/simple-import-items_");
    expect(importTable.rows).toEqual([]);
  });

  test("isCreateSessionTableAllowed can refuse edit and import", () => {
    class NoEdit extends CreateSessionTableRpcHandler {
      protected isCreateSessionTableAllowed() {
        return false;
      }
    }
    const { baseTable, handler } = testContext({ Handler: NoEdit });
    expect(
      call(handler, "createSessionTable", baseTable, {
        copyOption: "All",
        sessionType: "edit",
      }),
    ).toEqual(error("No permission to create session table for edit."));
  });

  test("sessionTableName selects a blueprint with its own columns and key", () => {
    const { addBlueprint, baseTable, handler, tableContainer } = testContext();
    addBlueprint(
      "rename-items",
      Columns.fromNames("itemId:string", "name:string", "note:string"),
      "itemId",
      "OTHER",
    );
    const result = call(handler, "createSessionTable", baseTable, {
      columnsToCopy: "id,name",
      copyOption: "All",
      sessionTableName: "rename-items",
      sessionType: "edit",
    });
    const sessionTable = sessionTableFromResult(tableContainer, result);
    expect((result.data as { module: string }).module).toBe("OTHER");
    expect(sessionTable.name).toContain("/simple-rename-items_");
    expect(sessionTable.sourceTable).toBe(baseTable);
    expect(sessionTable.schema.columns.map(({ name }) => name)).toEqual([
      "itemId",
      "name",
      "note",
      "vuuMsg",
      "vuuAction",
    ]);
    expect(sessionTable.getRowAtKey("A")).toEqual(["A", "Alpha", "", "", ""]);

    call(handler, "editCell", sessionTable, {
      column: "name",
      data: "Alpha edited",
      key: "A",
    });
    call(handler, "editCell", sessionTable, {
      column: "note",
      data: "session only",
      key: "B",
    });
    call(handler, "addRow", sessionTable, {
      key: "C",
      data: { name: "Gamma", note: "added" },
    });
    expect(
      call(handler, "endEditSession", sessionTable, { save: true }),
    ).toEqual({ type: "SUCCESS_RESULT", data: undefined });
    expect(baseTable.getRowAtKey("A")[1]).toBe("Alpha edited");
    expect(baseTable.getRowAtKey("B")[1]).toBe("Beta");
    expect(baseTable.getRowAtKey("C").slice(0, 2)).toEqual(["C", "Gamma"]);
  });

  test("columnsToCopy limits the copied columns and must name source columns", () => {
    const { baseTable, handler, tableContainer } = testContext();
    const sessionTable = sessionTableFromResult(
      tableContainer,
      call(handler, "createSessionTable", baseTable, {
        columnsToCopy: "id",
        copyOption: "All",
        sessionType: "edit",
      }),
    );
    expect(sessionTable.getRowAtKey("A")[sessionTable.columnMap.name]).toBe("");

    expect(
      call(handler, "createSessionTable", baseTable, {
        columnsToCopy: "id,nope",
        copyOption: "All",
        sessionType: "edit",
      }),
    ).toEqual(error("Column(s) not found in source table."));
  });

  test("by default the vuu default columns are not copied", () => {
    const { baseTable, handler, tableContainer } = testContext();
    const sessionTable = createSessionTable(handler, tableContainer, baseTable);
    const row = sessionTable.getRowAtKey("A");
    expect(row[sessionTable.columnMap.name]).toBe("Alpha");
    // the session table maintains its own timestamps
    expect(row[sessionTable.columnMap.vuuUpdatedTimestamp]).not.toBe(100);
  });

  test("customiseRowData applies when rows are copied and undone", () => {
    class Upper extends CreateSessionTableRpcHandler {
      protected customiseRowData(
        _viewport: unknown,
        data: Record<string, VuuRowDataItemType>,
      ) {
        return { ...data, name: String(data.name).toUpperCase() };
      }
    }
    const { baseTable, handler, tableContainer } = testContext({
      Handler: Upper,
    });
    const sessionTable = createSessionTable(handler, tableContainer, baseTable);
    expect(sessionTable.getRowAtKey("A")[1]).toBe("ALPHA");
    call(handler, "editCell", sessionTable, {
      column: "name",
      data: "edited",
      key: "A",
    });
    call(handler, "undoRowChange", sessionTable, { key: "A" });
    expect(sessionTable.getRowAtKey("A")[1]).toBe("ALPHA");
  });

  test("maxSessionTableSize caps the copied rows", () => {
    class One extends CreateSessionTableRpcHandler {
      protected maxSessionTableSize = 1;
    }
    const { baseTable, handler, tableContainer } = testContext({
      Handler: One,
    });
    expect(
      createSessionTable(handler, tableContainer, baseTable).rows,
    ).toHaveLength(1);
  });

  test("viewports on a session table use the blueprint's service", () => {
    const { baseTable, handler, tableContainer } = testContext();
    const blueprintService = new CreateSessionTableRpcHandler(tableContainer);
    const sourceService = new CreateSessionTableRpcHandler(tableContainer);
    const viewportContainer = new ViewportContainer(
      tableContainer,
      {} as ProviderContainer,
    );
    viewportContainer.addViewPortDefinition("items", (table) =>
      ViewPortDef(table.tableDef.columns, sourceService),
    );
    viewportContainer.addViewPortDefinition("edit-items", (table) =>
      ViewPortDef(table.tableDef.columns, blueprintService),
    );
    const sessionTable = createSessionTable(handler, tableContainer, baseTable);
    expect(viewportContainer.getViewPortDefinition(sessionTable).service).toBe(
      blueprintService,
    );
    expect(viewportContainer.getViewPortDefinition(baseTable).service).toBe(
      sourceService,
    );
  });
});

describe("beginEditSession backward compatibility", () => {
  test("works without a blueprint or the editable flag", () => {
    const { baseTable, tableContainer } = testContext({ editable: false });
    tableContainer.removeSessionTable("edit-items");
    const handler = new CreateSessionTableRpcHandler(tableContainer);
    const sessionTable = sessionTableFromResult(
      tableContainer,
      call(handler, "beginEditSession", baseTable, {
        editSessionMode: "all-rows",
      }),
    );
    expect(sessionTable.name).toContain("/simple-items_");
    expect(sessionTable.sourceTable).toBe(baseTable);
    expect(sessionTable.schema.columns.map(({ name }) => name)).toEqual([
      "id",
      "name",
      "vuuCreatedTimestamp",
      "vuuUpdatedTimestamp",
      "vuuMsg",
      "vuuAction",
    ]);
    expect(sessionTable.rows.map((row) => row.slice(0, 2))).toEqual([
      ["A", "Alpha"],
      ["B", "Beta"],
    ]);

    call(handler, "editCell", sessionTable, {
      column: "name",
      data: "Alpha edited",
      key: "A",
    });
    expect(
      call(handler, "endEditSession", sessionTable, { save: true }),
    ).toEqual({ type: "SUCCESS_RESULT", data: undefined });
    expect(baseTable.getRowAtKey("A")[1]).toBe("Alpha edited");
  });

  test("selected-rows and empty-session-table modes still work", () => {
    const { baseTable, handler, tableContainer } = testContext({
      editable: false,
    });
    const selected = sessionTableFromResult(
      tableContainer,
      call(
        handler,
        "beginEditSession",
        baseTable,
        { editSessionMode: "selected-rows" },
        new Set(["B"]),
      ),
    );
    expect(selected.rows.map((row) => row[0])).toEqual(["B"]);
    expect(
      call(handler, "beginEditSession", baseTable, { editSessionMode: "bad" }),
    ).toEqual({
      type: "ERROR_RESULT",
      errorMessage: "createSessionTable: invalid copyOption bad",
    });
  });

  test("getSessionTableCustomColumns still adds columns", () => {
    class WithNote extends CreateSessionTableRpcHandler {
      protected getSessionTableCustomColumns() {
        return [{ name: "note", dataType: "string" as const }];
      }
    }
    const { baseTable, tableContainer } = testContext({ Handler: WithNote });
    const handler = new WithNote(tableContainer);
    const sessionTable = sessionTableFromResult(
      tableContainer,
      call(handler, "beginEditSession", baseTable, {}),
    );
    expect(sessionTable.columnMap.note).toBe(5);
    expect(sessionTable.columnMap.vuuAction).toBe(6);
  });

  test("viewports on a legacy session table use the source table's service", () => {
    const { baseTable, handler, tableContainer } = testContext();
    const sourceService = new CreateSessionTableRpcHandler(tableContainer);
    const viewportContainer = new ViewportContainer(
      tableContainer,
      {} as ProviderContainer,
    );
    viewportContainer.addViewPortDefinition("items", (table) =>
      ViewPortDef(table.tableDef.columns, sourceService),
    );
    const sessionTable = sessionTableFromResult(
      tableContainer,
      call(handler, "beginEditSession", baseTable, {}),
    );
    expect(viewportContainer.getViewPortDefinition(sessionTable).service).toBe(
      sourceService,
    );
  });

  test("ignores sessionTableName, blueprints are not used", () => {
    const { addBlueprint, baseTable, handler, tableContainer } = testContext();
    addBlueprint(
      "notes-items",
      Columns.fromNames("id:string", "name:string", "note:string"),
    );
    const sessionTable = sessionTableFromResult(
      tableContainer,
      call(handler, "beginEditSession", baseTable, {
        editSessionMode: "all-rows",
        sessionTableName: "notes-items",
      }),
    );
    expect(sessionTable.name).toContain("/simple-items_");
    expect(sessionTable.schema.columns.map(({ name }) => name)).not.toContain(
      "note",
    );
  });
});

const DEFINED_TABLES = [
  { module: "TEST", table: "items" },
  { module: "TEST", table: "edit-items" },
];

const ITEM_COLUMNS = Columns.fromNames(
  "id:string",
  "name:string",
  "vuuCreatedTimestamp:epochtimestamp",
  "vuuUpdatedTimestamp:epochtimestamp",
  "vuuMsg:string",
);

function testContext({
  editable = true,
  Handler = CreateSessionTableRpcHandler,
}: {
  editable?: boolean;
  Handler?: typeof CreateSessionTableRpcHandler;
} = {}) {
  const joinProvider = new JoinTableProvider();
  const tableContainer = new TableContainer(joinProvider);
  const tableDef = TableDef({
    name: "items",
    keyField: "id",
    columns: ITEM_COLUMNS,
    editable,
  });
  tableDef.setModule({ name: "TEST" } as ViewServerModule);
  const baseTable = new InMemDataTable(tableDef, joinProvider);
  baseTable.insert(sourceRow("A", "Alpha", 100));
  baseTable.insert(sourceRow("B", "Beta", 200));
  tableContainer.addTable(baseTable);

  const addBlueprint = (
    name: string,
    columns = ITEM_COLUMNS,
    keyField = "id",
    module = "TEST",
  ) => {
    const blueprintDef = SessionTableDef({ name, keyField, columns });
    blueprintDef.setModule({ name: module } as ViewServerModule);
    tableContainer.addTable(new InMemDataTable(blueprintDef, joinProvider));
  };
  addBlueprint("edit-items");

  return {
    addBlueprint,
    baseTable,
    handler: new Handler(tableContainer),
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
    call(handler, "createSessionTable", baseTable, {
      copyOption: "All",
      sessionType: "edit",
    }),
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
  return sessionTable.getRowAtKey(key)[sessionTable.columnMap.vuuAction];
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
