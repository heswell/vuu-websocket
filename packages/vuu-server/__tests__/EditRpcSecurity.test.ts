import { describe, expect, test } from "bun:test";
import type { RpcResult, VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import {
  Columns,
  CreateSessionTableRpcHandler,
  PermissionFilter,
  TableDef,
  VuuUser,
  coerceCellValue,
  type CanSaveSessionResult,
  type CellEdit,
  type PreparedSessionSave,
  type SessionSaveResult,
} from "@heswell/vuu-server";
import { InMemDataTable } from "../src/core/table/InMemDataTable";
import { InMemSessionDataTable } from "../src/core/table/InMemSessionDataTable";
import { TableContainer } from "../src/core/table/TableContainer";
import type { ViewServerModule } from "../src/core/module/VsModule";
import { JoinTableProvider } from "../src/provider/JoinTableProvider";
import type { ProviderContainer } from "../src/provider/ProviderContainer";
import type { RequestContext } from "../src/net/RequestProcessor";
import { OutboundRowPublishQueue } from "../src/util/PublishQueue";
import type { Viewport } from "../src/viewport/Viewport";
import { ViewportContainer } from "../src/viewport/ViewportContainer";

const SESSION_1 = { sessionId: "session-1", channelId: "channel-1" };
const SESSION_2 = { sessionId: "session-2", channelId: "channel-2" };

const ok: RpcResult = { type: "SUCCESS_RESULT", data: undefined };
const error = (errorMessage: string): RpcResult => ({
  type: "ERROR_RESULT",
  errorMessage,
});

// columns: id, trader, price, qty, active, created, updated, vuuMsg
const order = (
  id: string,
  trader: string,
  price: number,
  qty: number,
): VuuDataRow => [id, trader, price, qty, true, 100, 100, ""];

/**
 * orders, permissioned so each user only sees the rows they trade. steve
 * sees o1 and o3, alice sees o2.
 */
const setup = (
  Handler: typeof CreateSessionTableRpcHandler = CreateSessionTableRpcHandler,
) => {
  const joinProvider = new JoinTableProvider();
  const tableDef = TableDef({
    name: "orders",
    keyField: "id",
    columns: Columns.fromNames(
      "id:string",
      "trader:string",
      "price:double",
      "qty:int",
      "active:boolean",
      "vuuCreatedTimestamp:epochtimestamp",
      "vuuUpdatedTimestamp:epochtimestamp",
      "vuuMsg:string",
    ),
    permissionFunction: (viewport) =>
      PermissionFilter("trader", new Set([viewport.user.name])),
  });
  tableDef.setModule({ name: "TEST" } as ViewServerModule);
  const orders = new InMemDataTable(tableDef, joinProvider);
  orders.insert(order("o1", "steve", 10, 100));
  orders.insert(order("o2", "alice", 20, 200));
  orders.insert(order("o3", "steve", 30, 300));

  const tableContainer = new TableContainer(joinProvider);
  tableContainer.addTable(orders);
  const viewportContainer = new ViewportContainer(
    tableContainer,
    {} as ProviderContainer,
  );
  const handler = new Handler(tableContainer);

  const createViewport = (
    table: InMemDataTable,
    user = "steve",
    session = SESSION_1,
  ) => {
    const vp = viewportContainer.create(
      "req-1",
      VuuUser(user),
      session,
      new OutboundRowPublishQueue(),
      table,
      {
        type: "CREATE_VP",
        table: table.tableDef.asVuuTable,
        aggregations: [],
        columns: table.schema.columns.map((c) => c.name),
        filterSpec: { filter: "" },
        groupBy: [],
        range: { from: 0, to: 100 },
        sort: { sortDefs: [] },
      },
    );
    vp.postDataForCurrentRange();
    return vp;
  };

  const ctxFor = (session = SESSION_1, user = "steve") =>
    ({ session, user: VuuUser(user) }) as unknown as RequestContext;

  const call = (
    rpcName: string,
    viewport: Viewport,
    namedParams: Record<string, unknown> = {},
    ctx = ctxFor(
      viewport.sessionId === SESSION_2.sessionId ? SESSION_2 : SESSION_1,
    ),
  ) =>
    handler.processRpcRequest(rpcName, {
      namedParams,
      viewport,
      ctx,
    } as never) as RpcResult;

  const beginSession = (
    viewport: Viewport,
    editSessionMode = "inline-all-rows",
  ) => {
    const result = call("beginEditSession", viewport, { editSessionMode });
    if (result.type === "ERROR_RESULT") throw Error(result.errorMessage);
    const { table } = result.data as { table: { table: string } };
    const sessionTable = tableContainer.getTable<InMemSessionDataTable>(
      table.table,
    );
    return { sessionTable, sessionVp: createViewport(sessionTable) };
  };

  return {
    beginSession,
    call,
    createViewport,
    ctxFor,
    handler,
    orders,
    tableContainer,
    viewportContainer,
  };
};

const keys = (table: InMemDataTable) => table.rows.map((row) => row[0]);

describe("editCell, session tables only by default", () => {
  test("direct edits of the source table are refused", () => {
    const { call, createViewport, orders } = setup();
    const vp = createViewport(orders);
    expect(
      call("editCell", vp, { key: "o1", column: "price", data: 99 }),
    ).toEqual(
      error(
        "editCell: viewport is not using a session table, direct edits are not permitted",
      ),
    );
    expect(orders.getRowAtKey("o1")[2]).toBe(10);
  });

  test("canEditSource opts in to direct edits", () => {
    class DirectEdit extends CreateSessionTableRpcHandler {
      protected canEditSource(_vp: Viewport, column: string) {
        return column === "price";
      }
    }
    const { call, createViewport, orders } = setup(DirectEdit);
    const vp = createViewport(orders);
    expect(
      call("editCell", vp, { key: "o1", column: "price", data: 99 }),
    ).toEqual(ok);
    expect(orders.getRowAtKey("o1")[2]).toBe(99);
    expect(orders.getRowAtKey("o1")[6]).toBeGreaterThan(100);
    // opt in is per column
    expect(
      call("editCell", vp, { key: "o1", column: "qty", data: 1 }).type,
    ).toBe("ERROR_RESULT");
    // direct edits respect row permissions
    expect(
      call("editCell", vp, { key: "o2", column: "price", data: 99 }),
    ).toEqual(error("editCell: row o2 not found"));
    expect(orders.getRowAtKey("o2")[2]).toBe(20);
  });

  test("a direct edit cannot move a row out of the user's permissions", () => {
    class DirectEdit extends CreateSessionTableRpcHandler {
      protected canEditSource() {
        return true;
      }
      protected isEditableColumn() {
        return true;
      }
    }
    const { call, createViewport, orders } = setup(DirectEdit);
    const vp = createViewport(orders);
    expect(
      call("editCell", vp, { key: "o1", column: "trader", data: "alice" }),
    ).toEqual(
      error("editCell: edit would make row o1 inaccessible to the user"),
    );
    expect(orders.getRowAtKey("o1")[1]).toBe("steve");
  });
});

describe("editCell column and type validation", () => {
  const sessionSetup = () => {
    const ctx = setup();
    const sourceVp = ctx.createViewport(ctx.orders);
    const { sessionTable, sessionVp } = ctx.beginSession(sourceVp);
    return { ...ctx, sessionTable, sessionVp, sourceVp };
  };

  test("edits a session table, coercing values to the column type", () => {
    const { call, orders, sessionTable, sessionVp } = sessionSetup();
    expect(
      call("editCell", sessionVp, { key: "o1", column: "price", data: "12.5" }),
    ).toEqual(ok);
    expect(
      call("editCell", sessionVp, { key: "o1", column: "qty", data: "150" }),
    ).toEqual(ok);
    expect(
      call("editCell", sessionVp, {
        key: "o1",
        column: "active",
        data: "false",
      }),
    ).toEqual(ok);
    const row = sessionTable.getRowAtKey("o1");
    expect(row.slice(2, 5)).toEqual([12.5, 150, false]);
    expect(orders.getRowAtKey("o1")[2]).toBe(10);
  });

  test("unknown, key and system columns are refused", () => {
    const { call, sessionVp } = sessionSetup();
    const edit = (column: string, data: unknown = "x") =>
      call("editCell", sessionVp, { key: "o1", column, data });
    expect(edit("nope")).toEqual(error("editCell: column nope not found"));
    expect(edit("id")).toEqual(error("editCell: column id is not editable"));
    for (const column of [
      "vuuCreatedTimestamp",
      "vuuUpdatedTimestamp",
      "vuuMsg",
    ]) {
      expect(edit(column, 1)).toEqual(
        error(`editCell: column ${column} is not editable`),
      );
    }
    expect(edit("vuu_action")).toEqual(
      error("editCell: vuu_action is server controlled"),
    );
  });

  test("values that don't match the column type are refused", () => {
    const { call, sessionTable, sessionVp } = sessionSetup();
    const edit = (column: string, data: unknown) =>
      call("editCell", sessionVp, { key: "o1", column, data });
    expect(edit("qty", 1.5)).toEqual(
      error("editCell: invalid value for column qty (int)"),
    );
    expect(edit("qty", "abc")).toEqual(
      error("editCell: invalid value for column qty (int)"),
    );
    expect(edit("price", "abc").type).toBe("ERROR_RESULT");
    expect(edit("price", { a: 1 }).type).toBe("ERROR_RESULT");
    expect(edit("trader", 42).type).toBe("ERROR_RESULT");
    expect(edit("active", "yes").type).toBe("ERROR_RESULT");
    expect(sessionTable.getRowAtKey("o1").slice(1, 5)).toEqual([
      "steve",
      10,
      100,
      true,
    ]);
  });

  test("isEditableColumn and validateCellEdit can be overridden", () => {
    const seen: Array<{ ctx: RequestContext; column: string }> = [];
    class Restricted extends CreateSessionTableRpcHandler {
      protected isEditableColumn(
        _t: unknown,
        column: string,
        _vp: Viewport,
        ctx: RequestContext,
      ) {
        seen.push({ ctx, column });
        return column === "qty";
      }
      protected validateCellEdit({ value }: CellEdit) {
        return (value as number) > 1000 ? "qty too large" : undefined;
      }
    }
    const ctx = setup(Restricted);
    const { sessionVp } = ctx.beginSession(ctx.createViewport(ctx.orders));
    const edit = (column: string, data: unknown) =>
      ctx.call("editCell", sessionVp, { key: "o1", column, data });
    expect(edit("price", 1)).toEqual(
      error("editCell: column price is not editable"),
    );
    expect(edit("qty", 5000)).toEqual(error("qty too large"));
    expect(edit("qty", 500)).toEqual(ok);
    expect(seen.at(-1)?.ctx.session).toEqual(SESSION_1);
  });

  test("editCell of a missing row is an error", () => {
    const { call, sessionVp } = sessionSetup();
    expect(
      call("editCell", sessionVp, { key: "zz", column: "price", data: 1 }),
    ).toEqual(error("editCell: row zz not found"));
  });

  test("coerceCellValue", () => {
    expect(coerceCellValue("42", "long")).toBe(42);
    expect(coerceCellValue(true, "boolean")).toBe(true);
    expect(coerceCellValue("x", undefined)).toBe("x");
    expect(() => coerceCellValue(Number.NaN, "double")).toThrow();
    expect(() => coerceCellValue(null, "string")).toThrow();
  });
});

describe("row permissions", () => {
  test("beginEditSession all-rows only copies rows visible to the user", () => {
    const { beginSession, createViewport, orders } = setup();
    const { sessionTable } = beginSession(createViewport(orders));
    expect(keys(sessionTable)).toEqual(["o1", "o3"]);

    const alice = setup();
    const { sessionTable: aliceTable } = alice.beginSession(
      alice.createViewport(alice.orders, "alice"),
    );
    expect(keys(aliceTable)).toEqual(["o2"]);
  });

  test("createSessionTable All only copies visible rows", () => {
    const { call, createViewport, orders, tableContainer } = setup();
    const result = call("createSessionTable", createViewport(orders), {
      copyOption: "All",
    });
    const { table } = (result as { data: { table: { table: string } } }).data;
    expect(keys(tableContainer.getTable(table.table))).toEqual(["o1", "o3"]);
  });

  test("hidden rows cannot be selected, nor copied as Selected", () => {
    const { call, createViewport, orders, tableContainer } = setup();
    const vp = createViewport(orders);
    vp.selectRow("o2", false);
    vp.selectRow("o3", true);
    vp.selectRow("nope", true);
    expect([...vp.selectedKeys]).toEqual(["o3"]);

    const result = call("createSessionTable", vp, { copyOption: "Selected" });
    const { table } = (result as { data: { table: { table: string } } }).data;
    expect(keys(tableContainer.getTable(table.table))).toEqual(["o3"]);
  });

  test("selectedKeys excludes rows hidden since they were selected", () => {
    const { createViewport, orders } = setup();
    const vp = createViewport(orders);
    vp.selectRow("o1", false);
    orders.upsert(["o1", "alice", 10, 100, true, 100, 100, ""]);
    expect([...vp.selectedKeys]).toEqual([]);
  });

  test("hidden rows cannot be edited, deleted or restored in a session", () => {
    const { beginSession, call, createViewport, orders } = setup();
    const { sessionTable, sessionVp } = beginSession(createViewport(orders));
    // smuggle a hidden source row into the session table
    sessionTable.insertSourceRow(orders.getRowAtKey("o2"));

    expect(
      call("editCell", sessionVp, { key: "o2", column: "price", data: 1 }),
    ).toEqual(error("editCell: row o2 not found"));
    expect(call("deleteRow", sessionVp, { key: "o2" })).toEqual(
      error("deleteRow: row o2 not found"),
    );
    expect(call("undoRowChange", sessionVp, { key: "o2" })).toEqual(
      error("undoRowChange: row o2 not found"),
    );
    expect(sessionTable.getRowAtKey("o2")[2]).toBe(20);
  });

  test("deleteSelectedRows refuses hidden keys", () => {
    const { beginSession, call, createViewport, orders } = setup();
    const { sessionTable } = beginSession(createViewport(orders));
    sessionTable.insertSourceRow(orders.getRowAtKey("o2"));
    const fakeVp = {
      dataTable: sessionTable,
      selectedKeys: new Set(["o1", "o2"]),
      permissionFilter: undefined,
    } as unknown as Viewport;
    expect(call("deleteSelectedRows", fakeVp)).toEqual(
      error("deleteSelectedRows: row o2 not found"),
    );
    expect(sessionTable.getSessionChanges()).toEqual([]);
  });

  test("a session save cannot move a row out of the user's permissions", () => {
    class AnyColumn extends CreateSessionTableRpcHandler {
      protected isEditableColumn() {
        return true;
      }
    }
    const { beginSession, call, createViewport, orders } = setup(AnyColumn);
    const { sessionTable, sessionVp } = beginSession(createViewport(orders));
    expect(
      call("editCell", sessionVp, {
        key: "o1",
        column: "trader",
        data: "alice",
      }),
    ).toEqual(ok);
    expect(call("endEditSession", sessionVp, { save: true })).toEqual(
      error("not permitted"),
    );
    expect(orders.getRowAtKey("o1")[1]).toBe("steve");
    expect(sessionTable.getRowAtKey("o1")[sessionTable.columnMap.vuuMsg]).toBe(
      "editRow:o1:not permitted",
    );
  });

  test("a session save cannot add rows the user could not see", () => {
    const { beginSession, call, createViewport, orders } = setup();
    const { sessionVp } = beginSession(createViewport(orders));
    expect(
      call("addRow", sessionVp, {
        key: "o9",
        data: { trader: "alice", price: 1, qty: 1 },
      }).type,
    ).toBe("SUCCESS_RESULT");
    expect(call("endEditSession", sessionVp, { save: true })).toEqual(
      error("not permitted"),
    );
    expect(orders.getRowAtKey("o9", false)).toBeUndefined();
  });
});

describe("session ownership", () => {
  test("another session cannot open a viewport on a session table", () => {
    const { beginSession, createViewport, orders } = setup();
    const { sessionTable } = beginSession(createViewport(orders));
    expect(() => createViewport(sessionTable, "alice", SESSION_2)).toThrow(
      `[ViewportContainer] no table ${sessionTable.name}`,
    );
  });

  test("RPCs on another session's viewport are refused", () => {
    const { beginSession, createViewport, ctxFor, orders, viewportContainer } =
      setup();
    const { sessionVp } = beginSession(createViewport(orders));
    expect(() =>
      viewportContainer.handleRpcRequest(
        sessionVp.id,
        "editCell",
        { key: "o1", column: "price", data: 1 },
        ctxFor(SESSION_2, "alice"),
      ),
    ).toThrow(`[ViewportContainer] viewport not found ${sessionVp.id}`);
    expect(() =>
      viewportContainer.selectRow(SESSION_2, sessionVp.id, "o1", false),
    ).toThrow(`[ViewportContainer] viewport not found ${sessionVp.id}`);
  });

  test("selection, tree, link and remove requests are refused for another session's viewport", () => {
    const { createViewport, orders, viewportContainer } = setup();
    const vp = createViewport(orders);
    const other = createViewport(orders, "alice", SESSION_2);
    vp.selectRow("o1", false);
    const notFound = `[ViewportContainer] viewport not found ${vp.id}`;
    for (const request of [
      () => viewportContainer.selectAll(vp.id, SESSION_2),
      () => viewportContainer.deselectAll(vp.id, SESSION_2),
      () =>
        viewportContainer.selectRowRange(vp.id, "o1", "o3", false, SESSION_2),
      () => viewportContainer.openTreeNode(vp.id, "$root", SESSION_2),
      () => viewportContainer.closeTreeNode(vp.id, "$root", SESSION_2),
      () =>
        viewportContainer.linkViewPorts(other.id, vp.id, "id", "id", SESSION_2),
      () => viewportContainer.unlinkViewPorts(vp.id, SESSION_2),
      () => viewportContainer.getViewPortVisualLinks(vp.id, SESSION_2),
      () => viewportContainer.getViewportForSession(vp.id, SESSION_2),
      () => viewportContainer.removeViewport(vp.id, SESSION_2),
    ]) {
      expect(request).toThrow(notFound);
    }
    expect([...vp.selectedKeys]).toEqual(["o1"]);
    expect(other.visualLink).toBeUndefined();
    expect(viewportContainer.getViewportById(vp.id)).toBe(vp);
    // the owner can still use its own viewport
    expect(viewportContainer.selectAll(vp.id, SESSION_1)).toBe(2);
    viewportContainer.removeViewport(vp.id, SESSION_1);
    expect(() => viewportContainer.getViewportById(vp.id)).toThrow(notFound);
  });

  test("edit RPCs refuse a session table owned by another session", () => {
    const { beginSession, call, createViewport, ctxFor, orders } = setup();
    const { sessionTable, sessionVp } = beginSession(createViewport(orders));
    const other = ctxFor(SESSION_2, "alice");
    for (const [rpc, params] of [
      ["editCell", { key: "o1", column: "price", data: 1 }],
      ["addRow", { key: "o9", data: {} }],
      ["deleteRow", { key: "o1" }],
      ["undoRowChange", { key: "o1" }],
      ["endEditSession", { save: true }],
    ] as const) {
      expect(call(rpc, sessionVp, params, other).type).toBe("ERROR_RESULT");
    }
    expect(sessionTable.getSessionChanges()).toEqual([]);
  });

  test("a session table cannot be the source of another session", () => {
    const { beginSession, call, createViewport, orders } = setup();
    const { sessionVp } = beginSession(createViewport(orders));
    expect(
      call("beginEditSession", sessionVp, {
        editSessionMode: "inline-all-rows",
      }),
    ).toEqual(
      error("createSessionTable: viewport is already using a session table"),
    );
  });
});

describe("session save (trader upstream issue 18)", () => {
  const editAndSave = (Handler: typeof CreateSessionTableRpcHandler) => {
    const ctx = setup(Handler);
    const { sessionTable, sessionVp } = ctx.beginSession(
      ctx.createViewport(ctx.orders),
    );
    expect(
      ctx.call("editCell", sessionVp, { key: "o1", column: "price", data: 11 }),
    ).toEqual(ok);
    const result = ctx.call("endEditSession", sessionVp, { save: true });
    return { ...ctx, result, sessionTable, sessionVp };
  };

  const expectSessionOpen = ({
    orders,
    sessionTable,
    tableContainer,
  }: ReturnType<typeof editAndSave>) => {
    expect(tableContainer.getTable(sessionTable.name) === sessionTable).toBe(
      true,
    );
    expect(sessionTable.getRowAtKey("o1")[2]).toBe(11);
    expect(sessionTable.getSessionChanges()).toHaveLength(1);
    expect(orders.getRowAtKey("o1")[2]).toBe(10);
    expect(orders.getRowAtKey("o1")[6]).toBe(100);
  };

  test("a successful save applies changes and closes the session", () => {
    const ctx = editAndSave(CreateSessionTableRpcHandler);
    expect(ctx.result).toEqual(ok);
    expect(ctx.orders.getRowAtKey("o1")[2]).toBe(11);
    expect(ctx.tableContainer.hasTable(ctx.sessionTable.name)).toBe(false);
  });

  test("canSaveSession receives the prepared save and ctx", () => {
    const calls: Array<[PreparedSessionSave, RequestContext]> = [];
    class Audit extends CreateSessionTableRpcHandler {
      protected canSaveSession(
        _vp: Viewport,
        prepared: PreparedSessionSave,
        ctx: RequestContext,
      ) {
        calls.push([prepared, ctx]);
        return true;
      }
    }
    expect(editAndSave(Audit).result).toEqual(ok);
    expect(calls[0][0].changes.map((c) => c.key)).toEqual(["o1"]);
    expect(calls[0][1].session).toEqual(SESSION_1);
  });

  for (const [label, verdict, message] of [
    ["false", false, "endEditSession: save not permitted"],
    ["a reason", "trading is closed", "trading is closed"],
  ] as Array<[string, CanSaveSessionResult, string]>) {
    test(`canSaveSession returning ${label} vetoes the save`, () => {
      class Veto extends CreateSessionTableRpcHandler {
        protected canSaveSession() {
          return verdict;
        }
      }
      const ctx = editAndSave(Veto);
      expect(ctx.result).toEqual(error(message));
      expectSessionOpen(ctx);
    });
  }

  test("canSaveSession may be async", async () => {
    class AsyncVeto extends CreateSessionTableRpcHandler {
      protected async canSaveSession() {
        return false;
      }
    }
    const ctx = editAndSave(AsyncVeto);
    expect(await ctx.result).toEqual(
      error("endEditSession: save not permitted"),
    );
    expectSessionOpen(ctx);
  });

  for (const [label, outcome, message] of [
    ["false", false, "endEditSession: save failed"],
    ["an ERROR_RESULT", error("database unavailable"), "database unavailable"],
  ] as Array<[string, SessionSaveResult, string]>) {
    test(`applySessionSave returning ${label} leaves the session open`, () => {
      class FailingSave extends CreateSessionTableRpcHandler {
        protected applySessionSave(table: InMemSessionDataTable) {
          // closes the session before reporting failure
          this.tableContainer.removeSessionTable(table.name);
          return outcome;
        }
      }
      const ctx = editAndSave(FailingSave);
      expect(ctx.result).toEqual(error(message));
      expectSessionOpen(ctx);
    });
  }

  test("changes made while an async canSaveSession is pending are not overwritten", async () => {
    let release = () => {};
    class SlowApproval extends CreateSessionTableRpcHandler {
      protected canSaveSession() {
        return new Promise<boolean>((resolve) => {
          release = () => resolve(true);
        });
      }
    }
    const ctx = editAndSave(SlowApproval);
    ctx.orders.update(ctx.orders.rowIndexAtKey("o1"), [
      "o1",
      "steve",
      10,
      999,
      true,
      100,
      200,
      "",
    ]);
    release();
    expect(await ctx.result).toEqual(error("stale update"));
    expect(ctx.orders.getRowAtKey("o1")[3]).toBe(999);
    expect(ctx.tableContainer.hasTable(ctx.sessionTable.name)).toBe(true);
  });

  test("an error thrown by applySessionSave leaves the session open", () => {
    class ThrowingSave extends CreateSessionTableRpcHandler {
      protected applySessionSave(): SessionSaveResult {
        throw Error("downstream rejected the order");
      }
    }
    const ctx = editAndSave(ThrowingSave);
    expect(ctx.result).toEqual(error("downstream rejected the order"));
    expectSessionOpen(ctx);
  });

  test("an async applySessionSave failure leaves the session open", async () => {
    class AsyncFailingSave extends CreateSessionTableRpcHandler {
      protected async applySessionSave(): Promise<SessionSaveResult> {
        throw Error("timeout");
      }
    }
    const ctx = editAndSave(AsyncFailingSave);
    expect(await ctx.result).toEqual(error("timeout"));
    expectSessionOpen(ctx);
  });

  test("a failure part way through the default save is rolled back", () => {
    const ctx = setup();
    const { sessionTable, sessionVp } = ctx.beginSession(
      ctx.createViewport(ctx.orders),
    );
    ctx.call("editCell", sessionVp, { key: "o1", column: "price", data: 11 });
    ctx.call("editCell", sessionVp, { key: "o3", column: "price", data: 33 });
    const update = ctx.orders.update.bind(ctx.orders);
    let count = 0;
    ctx.orders.update = (...args: Parameters<typeof update>) => {
      if (++count === 2) throw Error("write failed");
      return update(...args);
    };
    expect(ctx.call("endEditSession", sessionVp, { save: true })).toEqual(
      error("write failed"),
    );
    ctx.orders.update = update;
    expect(ctx.orders.getRowAtKey("o1")[2]).toBe(10);
    expect(ctx.orders.getRowAtKey("o3")[2]).toBe(30);
    expect(
      ctx.tableContainer.getTable(sessionTable.name) === sessionTable,
    ).toBe(true);
    expect(sessionTable.getSessionChanges()).toHaveLength(2);
  });
});
