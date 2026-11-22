// Session table blueprints (sessionTableDefs), as in Scala Vuu's
// ModuleFactory.addSessionTable + createSessionTable.
import type { DataSourceConfig, TableSchema } from "@vuu-ui/vuu-data-types";
import type {
  RpcResult,
  VuuRowDataItemType,
  VuuTable,
} from "@vuu-ui/vuu-protocol-types";
import { describe, expect, it } from "bun:test";
import type { EditContext, EditHooks } from "../src/core/module/edit-hooks";
import {
  type RpcService,
  type SessionTableDef,
  VuuModule,
} from "../src/core/module/VuuModule";
import type { TickingArrayDataSource } from "../src/ModuleDataSource";
import { buildDataColumnMapFromSchema, Table, type TableRow } from "../src/Table";

const schema: TableSchema = {
  columns: [
    { name: "id", serverDataType: "string" },
    { name: "name", serverDataType: "string" },
    { name: "price", serverDataType: "double" },
  ],
  key: "id",
  table: { module: "BP_TEST", table: "items" },
};

const itemsDef: SessionTableDef = { columns: schema.columns, key: "id" };

class BlueprintModule extends VuuModule<"items"> {
  protected menus = { items: undefined };
  protected schemas = { items: schema };
  protected tables: Record<"items", Table>;
  protected visualLinks = undefined;
  protected menuServices = undefined;
  protected services: Record<"items", RpcService[] | undefined> = {
    items: undefined,
  };
  protected editableTables: readonly "items"[];
  protected sessionTableDefs: Record<string, SessionTableDef>;

  constructor({
    editable = true,
    sessionTableDefs = { "edit-items": itemsDef },
  }: {
    editable?: boolean;
    sessionTableDefs?: Record<string, SessionTableDef>;
  } = {}) {
    super("BP_TEST");
    this.tables = {
      items: new Table(
        schema,
        [
          ["A", "Alpha", 1.5],
          ["B", "Beta", 2.5],
        ],
        buildDataColumnMapFromSchema(schema),
      ),
    };
    this.editableTables = editable ? ["items"] : [];
    this.sessionTableDefs = sessionTableDefs;
  }

  get items() {
    return this.tables.items;
  }

  session(name: string) {
    return this.getSessionTable(name);
  }
}

const sourceDataSource = (module: VuuModule<"items">) =>
  module.createDataSource("items", "source-vp", {
    columns: ["id", "name"],
  } as DataSourceConfig) as TickingArrayDataSource;

const createSessionTable = (
  ds: TickingArrayDataSource,
  params: Record<string, unknown>,
) =>
  ds.rpcRequest({
    type: "RPC_REQUEST",
    rpcName: "createSessionTable",
    params,
  } as never) as Promise<RpcResult>;

const sessionTableName = (result: RpcResult) => {
  if (result.type === "ERROR_RESULT") throw Error(result.errorMessage);
  return (result.data as { table: VuuTable }).table.table;
};

const error = (errorMessage: string): RpcResult => ({
  type: "ERROR_RESULT",
  errorMessage,
});

describe("VuuModule session table blueprints", () => {
  it("requires a sessionType", async () => {
    const ds = sourceDataSource(new BlueprintModule());
    expect(await createSessionTable(ds, { copyOption: "All" })).toEqual(
      error("Session type undefined"),
    );
  });

  it("fails when no blueprint is defined, there is no fallback", async () => {
    const ds = sourceDataSource(new BlueprintModule());
    expect(
      await createSessionTable(ds, { copyOption: "All", sessionType: "export" }),
    ).toEqual(error("session table export-items is not defined"));
    expect(
      await createSessionTable(ds, {
        copyOption: "All",
        sessionType: "edit",
        sessionTableName: "missing",
      }),
    ).toEqual(error("session table missing is not defined"));
    await expect(ds.createSessionDataSource?.("All", "export")).rejects.toThrow(
      "session table export-items is not defined",
    );
  });

  it("edit and import need an editable table, export does not", async () => {
    const module = new BlueprintModule({
      editable: false,
      sessionTableDefs: { "export-items": itemsDef, "edit-items": itemsDef },
    });
    const ds = sourceDataSource(module);
    for (const sessionType of ["edit", "import"]) {
      expect(
        await createSessionTable(ds, { copyOption: "All", sessionType }),
      ).toEqual(error("Table not editable"));
    }
    const name = sessionTableName(
      await createSessionTable(ds, { copyOption: "All", sessionType: "export" }),
    );
    expect(module.session(name).data).toHaveLength(2);
  });

  it("edit needs a copyOption, import is always empty", async () => {
    const module = new BlueprintModule({
      sessionTableDefs: { "edit-items": itemsDef, "import-items": itemsDef },
    });
    const ds = sourceDataSource(module);
    expect(await createSessionTable(ds, { sessionType: "edit" })).toEqual(
      error("Missing or invalid copy option."),
    );
    const name = sessionTableName(
      await createSessionTable(ds, { copyOption: "All", sessionType: "import" }),
    );
    expect(module.session(name).data).toEqual([]);
  });

  it("isCreateSessionTableAllowed can refuse edit", async () => {
    class Refusing extends BlueprintModule {
      protected isCreateSessionTableAllowed() {
        return false;
      }
    }
    const ds = sourceDataSource(new Refusing());
    expect(
      await createSessionTable(ds, { copyOption: "All", sessionType: "edit" }),
    ).toEqual(error("No permission to create session table for edit."));
  });

  it("sessionTableName selects a blueprint with its own columns and key", async () => {
    const module = new BlueprintModule({
      sessionTableDefs: {
        "rename-items": {
          columns: [
            { name: "itemId", serverDataType: "string" },
            { name: "name", serverDataType: "string" },
            { name: "note", serverDataType: "string" },
          ],
          key: "itemId",
        },
      },
    });
    const ds = sourceDataSource(module);
    const name = sessionTableName(
      await createSessionTable(ds, {
        columnsToCopy: "id,name",
        copyOption: "All",
        sessionTableName: "rename-items",
        sessionType: "edit",
      }),
    );
    const sessionTable = module.session(name);
    expect(sessionTable.schema.columns.map(({ name }) => name)).toEqual([
      "itemId",
      "name",
      "note",
      "vuuMsg",
      "vuuAction",
    ]);
    expect(sessionTable.findByKey("A")?.slice(0, 5)).toEqual([
      "A",
      "Alpha",
      "",
      "",
      "",
    ]);

    const session = module.createDataSource(name as "items", name, {
      columns: ["itemId", "name", "note"],
    } as DataSourceConfig) as TickingArrayDataSource;
    expect(await session.editCell("A", "name", "Alpha edited")).toMatchObject({
      type: "SUCCESS_RESULT",
    });
    expect(await session.editCell("B", "note", "session only")).toMatchObject({
      type: "SUCCESS_RESULT",
    });
    await session.addRow?.({ itemId: "C", name: "Gamma", note: "added" });
    await session.endEditSession?.(true);

    const { items } = module;
    expect(items.findByKey("A")?.[1]).toBe("Alpha edited");
    // a column the session table does not have keeps its source value
    expect(items.findByKey("A")?.[2]).toBe(1.5);
    expect(items.findByKey("B")?.slice(0, 3)).toEqual(["B", "Beta", 2.5]);
    expect(items.findByKey("C")?.slice(0, 2)).toEqual(["C", "Gamma"]);
  });

  it("columnsToCopy must name source columns", async () => {
    const ds = sourceDataSource(new BlueprintModule());
    expect(
      await createSessionTable(ds, {
        columnsToCopy: "id,nope",
        copyOption: "All",
        sessionType: "edit",
      }),
    ).toEqual(error("Column(s) not found in source table."));
  });

  it("copies Selected rows, up to maxSessionTableSize", async () => {
    class One extends BlueprintModule {
      protected maxSessionTableSize = 1;
    }
    const module = new One();
    const ds = sourceDataSource(module);
    const all = sessionTableName(
      await createSessionTable(ds, { copyOption: "All", sessionType: "edit" }),
    );
    expect(module.session(all).data).toHaveLength(1);

    const module2 = new BlueprintModule();
    const ds2 = sourceDataSource(module2);
    ds2.select({
      preserveExistingSelection: false,
      rowKey: "B",
      type: "SELECT_ROW",
    } as Parameters<typeof ds2.select>[0]);
    const selected = sessionTableName(
      await createSessionTable(ds2, {
        copyOption: "Selected",
        sessionType: "edit",
      }),
    );
    expect(module2.session(selected).data.map((row) => row[0])).toEqual(["B"]);
  });

  it("customiseRowData applies when rows are copied and undone", async () => {
    const contexts: EditContext[] = [];
    class Upper extends BlueprintModule {
      protected customiseRowData(
        data: Record<string, VuuRowDataItemType>,
        _sourceRow: TableRow,
        ctx: EditContext,
      ) {
        contexts.push(ctx);
        return { ...data, name: String(data.name).toUpperCase() };
      }
    }
    const module = new Upper();
    const ds = sourceDataSource(module);
    const session = (await ds.createSessionDataSource?.(
      "All",
    )) as TickingArrayDataSource;
    const sessionTable = module.session(session.table?.table as string);
    expect(sessionTable.findByKey("A")?.[1]).toBe("ALPHA");
    await session.editCell("A", "name", "edited");
    await session.undoRowChange?.("A");
    expect(sessionTable.findByKey("A")?.[1]).toBe("ALPHA");
    expect(contexts[0]).toMatchObject({
      tableName: "items",
      viewportId: "source-vp",
    });
  });

  it("session viewports use the blueprint's services and edit hooks, not the source table's", async () => {
    const blueprintCalls: string[] = [];
    const hooks: EditHooks = {
      validateCellEdit: ({ ctx }) => {
        blueprintCalls.push(`validate:${ctx.sessionTableDefName}`);
      },
    };
    const services: RpcService[] = [
      {
        rpcName: "endEditSession",
        service: async () => {
          blueprintCalls.push("endEditSession");
          return { type: "SUCCESS_RESULT", data: undefined };
        },
      },
    ];
    class WithSourceServices extends BlueprintModule {
      protected services = {
        items: [
          {
            rpcName: "endEditSession",
            service: async () =>
              ({ type: "ERROR_RESULT", errorMessage: "source" }) as const,
          },
        ],
      };
      protected editHooks = {
        items: {
          validateCellEdit: () => "source hooks must not apply to a session",
        },
      };
    }
    const module = new WithSourceServices({
      sessionTableDefs: {
        "edit-items": { ...itemsDef, editHooks: hooks, services },
      },
    });
    const session = (await sourceDataSource(module).createSessionDataSource?.(
      "All",
    )) as TickingArrayDataSource;
    expect(await session.editCell("A", "name", "x")).toMatchObject({
      type: "SUCCESS_RESULT",
    });
    await session.endEditSession?.(true);
    expect(blueprintCalls).toEqual(["validate:edit-items", "endEditSession"]);
  });
});

describe("VuuModule beginEditSession backward compatibility", () => {
  const beginEditSession = (
    ds: TickingArrayDataSource,
    params: Record<string, unknown> = {},
  ) =>
    ds.rpcRequest({
      type: "RPC_REQUEST",
      rpcName: "beginEditSession",
      params: { editSessionMode: "all-rows", ...params },
    } as never) as Promise<RpcResult>;

  it("works without a blueprint or editableTables, using the source table's services and hooks", async () => {
    const calls: string[] = [];
    class Legacy extends BlueprintModule {
      protected services: Record<"items", RpcService[] | undefined> = {
        items: [
          {
            rpcName: "endEditSession",
            service: async () => {
              calls.push("source endEditSession");
              return { type: "SUCCESS_RESULT", data: undefined };
            },
          },
        ],
      };
      protected editHooks = {
        items: {
          validateCellEdit: () => {
            calls.push("source validateCellEdit");
          },
        },
      };
    }
    const module = new Legacy({ editable: false, sessionTableDefs: {} });
    const result = await beginEditSession(sourceDataSource(module));
    expect(result).toMatchObject({
      type: "SUCCESS_RESULT",
      data: { renderComponent: "inline-form" },
    });
    const name = sessionTableName(result);
    const sessionTable = module.session(name);
    expect(sessionTable.data.map((row) => row.slice(0, 3))).toEqual([
      ["A", "Alpha", 1.5],
      ["B", "Beta", 2.5],
    ]);

    const session = module.createDataSource(name as "items", name, {
      columns: ["id", "name"],
    } as DataSourceConfig) as TickingArrayDataSource;
    await session.editCell("A", "name", "edited");
    await session.undoRowChange?.("A");
    expect(sessionTable.findByKey("A")?.[1]).toBe("Alpha");
    await session.endEditSession?.(true);
    expect(calls).toEqual(["source validateCellEdit", "source endEditSession"]);
  });

  it("saves a legacy session to the source table", async () => {
    const module = new BlueprintModule({ editable: false, sessionTableDefs: {} });
    const name = sessionTableName(
      await beginEditSession(sourceDataSource(module)),
    );
    const session = module.createDataSource(name as "items", name, {
      columns: ["id", "name"],
    } as DataSourceConfig) as TickingArrayDataSource;
    await session.editCell("A", "name", "Alpha edited");
    await session.endEditSession?.(true);
    expect(module.items.findByKey("A")?.slice(0, 3)).toEqual([
      "A",
      "Alpha edited",
      1.5,
    ]);
  });

  it("ignores sessionTableName, blueprints are not used", async () => {
    const module = new BlueprintModule({ editable: true });
    const result = await beginEditSession(sourceDataSource(module), {
      sessionTableName: "missing",
    });
    expect(result).toMatchObject({ type: "SUCCESS_RESULT" });
    const name = sessionTableName(result);
    expect(module.session(name).data.map((row) => row.slice(0, 3))).toEqual([
      ["A", "Alpha", 1.5],
      ["B", "Beta", 2.5],
    ]);
  });
});
