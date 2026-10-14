import type { DataSourceConfig, TableSchema } from "@vuu-ui/vuu-data-types";
import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { buildDataColumnMapFromSchema, Table } from "../src/Table";
import type { TickingArrayDataSource } from "../src/ModuleDataSource";
import { VuuModule } from "../src/core/module/VuuModule";
import {
  defaultApplySessionSave,
  type EditHooks,
  type PreparedSessionSave,
} from "../src/core/module/edit-hooks";

const schema: TableSchema = {
  columns: [
    { name: "id", serverDataType: "string" },
    { name: "name", serverDataType: "string" },
  ],
  key: "id",
  table: { module: "EDIT_TEST", table: "items" },
};

class EditingModule extends VuuModule<"items"> {
  protected menus = { items: undefined };
  protected schemas = { items: schema };
  protected tables: Record<"items", Table>;
  protected visualLinks = undefined;
  protected editHooks: Partial<Record<"items", EditHooks>>;

  constructor(table: Table, hooks?: EditHooks) {
    super("EDIT_TEST");
    this.tables = { items: table };
    this.editHooks = hooks ? { items: hooks } : {};
  }

  createSourceDataSource() {
    return this.createDataSource("items", "source-vp", {
      columns: ["id", "name"],
    } as DataSourceConfig) as TickingArrayDataSource;
  }

  getSessionTableForTest() {
    const [sessionTable] = Object.values(this.sessionTableMap);
    if (!sessionTable) {
      throw Error("Expected an active session table");
    }
    return sessionTable;
  }
}

describe("VuuModule edit actions", () => {
  let module: EditingModule;
  let sourceTable: Table;
  let sessionDataSource: TickingArrayDataSource;
  let sessionTable: Table;

  beforeEach(async () => {
    sourceTable = new Table(
      schema,
      [
        ["row-001", "Alice"],
        ["row-002", "Bob"],
      ],
      buildDataColumnMapFromSchema(schema),
    );
    module = new EditingModule(sourceTable);
    const sourceDataSource = module.createDataSource("items", "source-vp", {
      columns: ["id", "name"],
    } as DataSourceConfig) as TickingArrayDataSource;
    sessionDataSource = (await sourceDataSource.createSessionDataSource(
      "All",
    )) as TickingArrayDataSource;
    sessionTable = module.getSessionTableForTest();
  });

  it("records each edit RPC and preserves addRow after editing an inserted row", async () => {
    await sessionDataSource.editCell("row-001", "name", "Alicia");
    await sessionDataSource.addRow({ id: "row-003", name: "Carol" });
    await sessionDataSource.editCell("row-003", "name", "Caroline");
    await sessionDataSource.deleteRow("row-002", "soft");

    expect(
      sessionTable.findByKey("row-001")?.[sessionTable.map.vuuAction],
    ).toBe("editCell");
    expect(
      sessionTable.findByKey("row-002")?.[sessionTable.map.vuuAction],
    ).toBe("deleteRow");
    expect(
      sessionTable.findByKey("row-003")?.[sessionTable.map.vuuAction],
    ).toBe("addRow");
  });

  it("applies recorded actions to the source table when the session is saved", async () => {
    await sessionDataSource.editCell("row-001", "name", "Alicia");
    await sessionDataSource.addRow({ id: "row-003", name: "Carol" });
    await sessionDataSource.editCell("row-003", "name", "Caroline");
    await sessionDataSource.deleteRow("row-002", "soft");

    await sessionDataSource.endEditSession(true);

    expect(sourceTable.findByKey("row-001")?.[sourceTable.map.name]).toBe(
      "Alicia",
    );
    expect(sourceTable.findByKey("row-002")).toBeUndefined();
    expect(sourceTable.findByKey("row-003")?.[sourceTable.map.name]).toBe(
      "Caroline",
    );
  });

  it("uses vuuAction to undo inserts, edits, and deletes", async () => {
    await sessionDataSource.editCell("row-001", "name", "Alicia");
    await sessionDataSource.deleteRow("row-002", "soft");
    await sessionDataSource.addRow({ id: "row-003", name: "Carol" });

    await sessionDataSource.undoRowChange("row-001");
    await sessionDataSource.undoRowChange("row-002");
    const insertResult = await sessionDataSource.undoRowChange("row-003");

    expect(sessionTable.findByKey("row-001")?.[sessionTable.map.name]).toBe(
      "Alice",
    );
    expect(
      sessionTable.findByKey("row-001")?.[sessionTable.map.vuuAction],
    ).toBe("");
    expect(
      sessionTable.findByKey("row-002")?.[sessionTable.map.vuuAction],
    ).toBe("");
    expect(sessionTable.findByKey("row-003")).toBeUndefined();
    expect(insertResult).toEqual({
      type: "SUCCESS_RESULT",
      data: { wasInsertedRow: true },
    });
  });

  it("deselects all rows after deleting the selected rows", async () => {
    sessionDataSource.select({
      preserveExistingSelection: false,
      rowKey: "row-001",
      type: "SELECT_ROW",
    });
    sessionDataSource.select({
      preserveExistingSelection: true,
      rowKey: "row-002",
      type: "SELECT_ROW",
    });

    const result = await sessionDataSource.deleteSelectedRows("soft");

    expect(result).toEqual({
      type: "SUCCESS_RESULT",
      data: { deletedKeys: ["row-001", "row-002"] },
    });
    expect(sessionDataSource.getSelectedRowIds()).toEqual([]);
  });

  it("rejects edits to deleted session rows", async () => {
    await sessionDataSource.deleteRow("row-002", "soft");

    const result = await sessionDataSource.editCell(
      "row-002",
      "name",
      "Robert",
    );

    expect(result).toEqual({
      type: "ERROR_RESULT",
      errorMessage: "editCell: cannot edit a deleted row",
    });
    expect(sessionTable.findByKey("row-002")?.[sessionTable.map.name]).toBe(
      "Bob",
    );
    expect(
      sessionTable.findByKey("row-002")?.[sessionTable.map.vuuAction],
    ).toBe("deleteRow");
  });
});

// trader upstream issue 76: delete in an edit session marks the row (as
// vuu-server does) whatever the mode, so the save sees it.
describe("VuuModule deleteRow (vuu-server semantics)", () => {
  let sourceTable: Table;
  let saved: PreparedSessionSave["changes"];
  let module: EditingModule;
  let sessionDataSource: TickingArrayDataSource;
  let sessionTable: Table;

  beforeEach(async () => {
    saved = [];
    sourceTable = new Table(
      schema,
      [
        ["row-001", "Alice"],
        ["row-002", "Bob"],
      ],
      buildDataColumnMapFromSchema(schema),
    );
    module = new EditingModule(sourceTable, {
      applySessionSave: (session, prepared, ctx) => {
        saved = prepared.changes;
        return defaultApplySessionSave(session, prepared, ctx);
      },
    });
    sessionDataSource = (await module
      .createSourceDataSource()
      .createSessionDataSource("All")) as TickingArrayDataSource;
    sessionTable = module.getSessionTableForTest();
  });

  const actionOf = (key: string) =>
    sessionTable.findByKey(key)?.[sessionTable.map.vuuAction];

  it.each(["hard", "soft", undefined] as const)(
    "marks the row (mode %p) and keeps it in the session",
    async (mode) => {
      const result = await sessionDataSource.deleteRow("row-002", mode);
      expect(result).toBe(true);
      expect(sessionTable.findByKey("row-002")).toBeDefined();
      expect(actionOf("row-002")).toBe("deleteRow");
      expect(sourceTable.findByKey("row-002")).toBeDefined();
    },
  );

  it("passes a hard delete to applySessionSave and removes the row on save", async () => {
    await sessionDataSource.deleteRow("row-002", "hard");
    await sessionDataSource.endEditSession(true);

    expect(saved.map(({ action, key }) => [action, key])).toEqual([
      ["deleteRow", "row-002"],
    ]);
    expect(sourceTable.findByKey("row-002")).toBeUndefined();
    expect(sessionTable.findByKey("row-002")).toBeUndefined();
  });

  it("undo restores a hard-deleted row", async () => {
    await sessionDataSource.deleteRow("row-002", "hard");
    const result = await sessionDataSource.undoRowChange("row-002");

    expect(result).toEqual({ type: "SUCCESS_RESULT", data: undefined });
    expect(actionOf("row-002")).toBe("");
    expect(sessionTable.findByKey("row-002")?.[sessionTable.map.name]).toBe(
      "Bob",
    );
    await sessionDataSource.endEditSession(true);
    expect(saved).toEqual([]);
    expect(sourceTable.findByKey("row-002")).toBeDefined();
  });

  it("drops a row added in the session", async () => {
    await sessionDataSource.addRow({ id: "row-003", name: "Carol" });
    await sessionDataSource.deleteRow("row-003", "hard");

    expect(sessionTable.findByKey("row-003")).toBeUndefined();
    await sessionDataSource.endEditSession(true);
    expect(saved).toEqual([]);
    expect(sourceTable.findByKey("row-003")).toBeUndefined();
  });

  it("deleteSelectedRows marks every selected row (mode hard)", async () => {
    sessionDataSource.select({
      preserveExistingSelection: false,
      rowKey: "row-001",
      type: "SELECT_ROW",
    });
    await sessionDataSource.deleteSelectedRows("hard");
    expect(actionOf("row-001")).toBe("deleteRow");
  });

  it("refuses an unknown key", async () => {
    expect(await sessionDataSource.deleteRow("row-999", "hard")).toBe(
      "deleteRow: row row-999 not found",
    );
  });

  it("refuses deleteRow outside an edit session and leaves the source row", async () => {
    const otherModule = new EditingModule(sourceTable);
    const sourceDataSource = otherModule.createSourceDataSource();
    expect(await sourceDataSource.deleteRow("row-001", "hard")).toBe(
      "deleteRow: only supported in an edit session",
    );
    expect(sourceTable.findByKey("row-001")).toBeDefined();
  });
});
