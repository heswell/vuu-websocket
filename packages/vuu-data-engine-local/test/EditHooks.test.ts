// trader upstream issue 22: per-table edit hooks and RPC service overrides.
import "./browser-globals";
import type { DataSourceConfig, TableSchema } from "@vuu-ui/vuu-data-types";
import { StaleUpdateError } from "@vuu-ui/vuu-utils";
import { describe, expect, it } from "bun:test";
import {
  defaultApplySessionSave,
  type EditHooks,
  type PreparedSessionSave,
  SAVE_NOT_PERMITTED,
  STALE_UPDATE,
} from "../src/core/module/edit-hooks";
import { type RpcService, VuuModule } from "../src/core/module/VuuModule";
import type { TickingArrayDataSource } from "../src/ModuleDataSource";
import { buildDataColumnMapFromSchema, Table } from "../src/Table";

type TableName = "parentOrders" | "childOrders";

const createSchema = (table: TableName): TableSchema => ({
  columns: [
    { name: "id", serverDataType: "string" },
    { name: "qty", serverDataType: "int" },
    { name: "status", serverDataType: "string" },
  ],
  key: "id",
  table: { module: "ORDERS", table },
});

const createTable = (table: TableName) => {
  const schema = createSchema(table);
  return new Table(
    schema,
    [
      ["1", 100, "NEW"],
      ["2", 200, "NEW"],
    ],
    buildDataColumnMapFromSchema(schema),
  );
};

class OrdersModule extends VuuModule<TableName> {
  protected menus = { parentOrders: undefined, childOrders: undefined };
  protected schemas = {
    parentOrders: createSchema("parentOrders"),
    childOrders: createSchema("childOrders"),
  };
  protected services: Record<TableName, RpcService[] | undefined>;
  protected tables = {
    parentOrders: createTable("parentOrders"),
    childOrders: createTable("childOrders"),
  };
  protected menuServices = undefined;
  protected visualLinks = undefined;
  protected editHooks: Partial<Record<TableName, EditHooks>>;

  constructor(parentOrderHooks: EditHooks, childOrderServices?: RpcService[]) {
    super("ORDERS");
    this.editHooks = { parentOrders: parentOrderHooks };
    this.services = {
      parentOrders: undefined,
      childOrders: childOrderServices,
    };
  }

  table(name: TableName) {
    return this.tables[name];
  }
}

const openSession = async (module: OrdersModule, table: TableName) => {
  const source = module.createDataSource(table, `${table}-vp`, {
    columns: ["id", "qty", "status"],
  } as DataSourceConfig) as TickingArrayDataSource;
  return (await source.createSessionDataSource(
    "All",
  )) as TickingArrayDataSource;
};

const qtyOf = (table: Table, key: string) =>
  table.findByKey(key)?.[table.map.qty];

/** A stand-in for trader's order service. */
const createOrderService = () => {
  const amendments: { key: string; qty: unknown }[] = [];
  return {
    amendments,
    applySessionSave: (_session: Table, { changes }: PreparedSessionSave) => {
      for (const { key, cellUpdates } of changes) {
        amendments.push({ key, qty: cellUpdates.qty });
      }
    },
  };
};

describe("per-table edit hooks", () => {
  it("routes a parentOrders save through its applySessionSave, other tables use the default", async () => {
    const orderService = createOrderService();
    const module = new OrdersModule({
      applySessionSave: orderService.applySessionSave,
    });

    const parentSession = await openSession(module, "parentOrders");
    await parentSession.editCell("1", "qty", 150);
    await parentSession.endEditSession(true);

    expect(orderService.amendments).toEqual([{ key: "1", qty: 150 }]);
    // not written to the source table by the generic save
    expect(qtyOf(module.table("parentOrders"), "1")).toBe(100);

    const childSession = await openSession(module, "childOrders");
    await childSession.editCell("1", "qty", 150);
    await childSession.endEditSession(true);
    expect(qtyOf(module.table("childOrders"), "1")).toBe(150);
  });

  it("can call defaultApplySessionSave for changes that should reach the source", async () => {
    const module = new OrdersModule({
      applySessionSave: (session, prepared) =>
        defaultApplySessionSave(session, {
          ...prepared,
          changes: prepared.changes.filter(({ key }) => key === "2"),
        }),
    });
    const session = await openSession(module, "parentOrders");
    await session.editCell("1", "qty", 111);
    await session.editCell("2", "qty", 222);
    await session.endEditSession(true);
    expect(qtyOf(module.table("parentOrders"), "1")).toBe(100);
    expect(qtyOf(module.table("parentOrders"), "2")).toBe(222);
  });

  it("canSaveSession can veto a save, leaving the session open", async () => {
    let permitted: boolean | string = "qty above limit";
    const orderService = createOrderService();
    const module = new OrdersModule({
      canSaveSession: () => permitted,
      applySessionSave: orderService.applySessionSave,
    });
    const session = await openSession(module, "parentOrders");
    await session.editCell("1", "qty", 5000);

    await expect(session.endEditSession(true)).rejects.toThrow(
      "qty above limit",
    );
    expect(orderService.amendments).toEqual([]);

    permitted = false;
    await expect(session.endEditSession(true)).rejects.toThrow(
      SAVE_NOT_PERMITTED,
    );

    // still open: the user can retry once permitted
    permitted = true;
    await session.endEditSession(true);
    expect(orderService.amendments).toEqual([{ key: "1", qty: 5000 }]);
  });

  it("supports an async canSaveSession", async () => {
    const orderService = createOrderService();
    const module = new OrdersModule({
      canSaveSession: async ({ changes }) =>
        changes.every(({ cellUpdates }) => Number(cellUpdates.qty) < 1000) ||
        "too big",
      applySessionSave: orderService.applySessionSave,
    });
    const session = await openSession(module, "parentOrders");
    await session.editCell("1", "qty", 5000);
    await expect(session.endEditSession(true)).rejects.toThrow("too big");
    await session.editCell("1", "qty", 500);
    await session.endEditSession(true);
    expect(orderService.amendments).toEqual([{ key: "1", qty: 500 }]);
  });

  it('fails with exactly "stale update" when the source row changed', async () => {
    const orderService = createOrderService();
    const module = new OrdersModule({
      applySessionSave: orderService.applySessionSave,
    });
    const session = await openSession(module, "parentOrders");
    await session.editCell("1", "qty", 150);
    // another user amends the order
    module.table("parentOrders").update("1", "qty", 120);

    const rpcResult = await session.rpcRequest({
      type: "RPC_REQUEST",
      rpcName: "endEditSession",
      params: { save: true },
    });
    expect(rpcResult).toEqual({
      type: "ERROR_RESULT",
      errorMessage: STALE_UPDATE,
    });
    expect(STALE_UPDATE).toBe("stale update");
    await expect(session.endEditSession(true)).rejects.toBeInstanceOf(
      StaleUpdateError,
    );
    expect(orderService.amendments).toEqual([]);

    const sessionTable = Object.values(
      (module as unknown as { sessionTableMap: Record<string, Table> })
        .sessionTableMap,
    )[0];
    expect(sessionTable.findByKey("1")?.[sessionTable.map.vuuMsg]).toBe(
      "stale:1:qty",
    );
  });

  it("ignores changes to columns not edited in the session", async () => {
    const orderService = createOrderService();
    const module = new OrdersModule({
      applySessionSave: orderService.applySessionSave,
    });
    const session = await openSession(module, "parentOrders");
    await session.editCell("1", "qty", 150);
    module.table("parentOrders").update("1", "status", "FILLED");
    await session.endEditSession(true);
    expect(orderService.amendments).toEqual([{ key: "1", qty: 150 }]);
  });

  it("getStaleColumns can be overridden", async () => {
    const orderService = createOrderService();
    const module = new OrdersModule({
      getStaleColumns: (_table, sourceRow, { sourceSnapshot }) =>
        sourceSnapshot &&
        sourceRow[_table.map.status] !== sourceSnapshot[_table.map.status]
          ? ["status"]
          : [],
      applySessionSave: orderService.applySessionSave,
    });
    const session = await openSession(module, "parentOrders");
    await session.editCell("1", "qty", 150);
    module.table("parentOrders").update("1", "status", "FILLED");
    await expect(session.endEditSession(true)).rejects.toThrow(STALE_UPDATE);
  });

  it("leaves the session open when applySessionSave fails", async () => {
    let fail = true;
    const orderService = createOrderService();
    const module = new OrdersModule({
      applySessionSave: (session, prepared, ctx) => {
        if (fail) {
          throw Error("order service unavailable");
        }
        return orderService.applySessionSave(session, prepared);
      },
    });
    const session = await openSession(module, "parentOrders");
    await session.editCell("1", "qty", 150);
    await expect(session.endEditSession(true)).rejects.toThrow(
      "order service unavailable",
    );
    fail = false;
    await session.endEditSession(true);
    expect(orderService.amendments).toEqual([{ key: "1", qty: 150 }]);
  });

  it("validateCellEdit and isEditableColumn can refuse edits", async () => {
    const module = new OrdersModule({
      isEditableColumn: (_table, column) => column === "qty",
      validateCellEdit: ({ column, value }) =>
        column === "qty" && Number(value) <= 0
          ? "qty must be positive"
          : undefined,
    });
    const session = await openSession(module, "parentOrders");
    expect(await session.editCell("1", "qty", -1)).toMatchObject({
      type: "ERROR_RESULT",
      errorMessage: "qty must be positive",
    });
    expect(await session.editCell("1", "status", "X")).toMatchObject({
      type: "ERROR_RESULT",
    });
    expect(await session.editCell("1", "qty", 10)).toMatchObject({
      type: "SUCCESS_RESULT",
    });
  });

  it("the key column is not editable by default", async () => {
    const module = new OrdersModule({});
    const session = await openSession(module, "childOrders");
    expect(await session.editCell("1", "id", "99")).toMatchObject({
      type: "ERROR_RESULT",
    });
  });
});

describe("per-table RPC service overrides", () => {
  it("a table service replaces the built-in endEditSession for that table only", async () => {
    const calls: unknown[] = [];
    const module = new OrdersModule({}, [
      {
        rpcName: "endEditSession",
        service: async (request) => {
          calls.push(request.params);
          return { type: "SUCCESS_RESULT", data: "custom" };
        },
      },
    ]);
    const childSession = await openSession(module, "childOrders");
    await childSession.editCell("1", "qty", 150);
    await childSession.endEditSession(true);
    expect(calls).toEqual([{ save: true }]);
    expect(qtyOf(module.table("childOrders"), "1")).toBe(100);

    const parentSession = await openSession(module, "parentOrders");
    await parentSession.editCell("1", "qty", 150);
    await parentSession.endEditSession(true);
    expect(calls).toHaveLength(1);
    expect(qtyOf(module.table("parentOrders"), "1")).toBe(150);
  });

  it("moduleServices override built-ins for every table, table services win", async () => {
    class WithModuleServices extends OrdersModule {
      protected moduleServices: RpcService[] = [
        {
          rpcName: "endEditSession",
          service: async () => ({
            type: "ERROR_RESULT",
            errorMessage: "module",
          }),
        },
      ];
    }
    const module = new WithModuleServices({}, [
      {
        rpcName: "endEditSession",
        service: async () => ({ type: "ERROR_RESULT", errorMessage: "table" }),
      },
    ]);
    const parentSession = await openSession(module, "parentOrders");
    await expect(parentSession.endEditSession(true)).rejects.toThrow("module");
    const childSession = await openSession(module, "childOrders");
    await expect(childSession.endEditSession(true)).rejects.toThrow("table");
  });
});
