import { afterEach, describe, expect, test } from "bun:test";
import {
  type DataTable,
  type InMemSessionDataTable,
  LifecycleContainer,
  LoginTokenService,
  type RpcParams,
  VuuServer,
  VuuServerConfig,
  VuuWebSocketOptions,
} from "@heswell/vuu-server";
import type { RpcResult } from "@vuu-ui/vuu-protocol-types";
import {
  ENTITIES,
  ENTITY_LIMITS,
  LimitsModule,
  validateEntityLimitValue,
} from "../src";

type Service = {
  processRpcRequest: (
    rpcName: string,
    params: RpcParams,
  ) => RpcResult | Promise<RpcResult>;
};

let lifecycle: LifecycleContainer | undefined;

afterEach(async () => {
  await lifecycle?.destroy();
  lifecycle = undefined;
});

const valuesOf = (table: DataTable, key: string) => {
  const values = table.getRowAtKey(key);
  return Object.fromEntries(
    table.schema.columns.map(({ name }) => [
      name,
      values[table.columnMap[name]],
    ]),
  );
};

const setup = async () => {
  const module = LimitsModule();
  lifecycle = new LifecycleContainer();
  const server = new VuuServer(
    VuuServerConfig(
      VuuWebSocketOptions().withWsPort(0),
      {},
      LoginTokenService(),
    ).withModule(module),
    lifecycle,
  );
  await lifecycle.start();
  const { tableContainer } = server;
  const entityLimits = tableContainer.getTable<DataTable>(ENTITY_LIMITS);

  const call = (
    table: DataTable,
    rpcName: string,
    namedParams: Record<string, unknown> = {},
  ) => {
    const factory = module.viewPortDefs.get(table.tableDef.name) as unknown as (
      ...args: unknown[]
    ) => { service: Service };
    return factory(
      table,
      undefined,
      undefined,
      tableContainer,
    ).service.processRpcRequest(rpcName, {
      ctx: {
        session: { channelId: "test-channel", sessionId: "test-session" },
        user: { name: "jsmith" },
      },
      namedParams,
      viewport: { dataTable: table, selectedKeys: new Set<string>() },
    } as unknown as RpcParams);
  };

  const editSession = async () => {
    const result = await call(entityLimits, "createSessionTable", {
      copyOption: "All",
      sessionType: "edit",
    });
    if (result.type === "ERROR_RESULT") throw Error(result.errorMessage);
    const { table } = result.data as { table: { table: string } };
    const session = tableContainer.getTable<InMemSessionDataTable>(table.table);
    return {
      editCell: (key: string, column: string, value: number | null) =>
        call(session, "editCell", { column, data: value, key }),
      save: () => call(session, "endEditSession", { save: true }),
      sessionRow: (key: string) => valuesOf(session, key),
    };
  };

  return {
    editSession,
    entities: tableContainer.getTable<DataTable>(ENTITIES),
    entityLimits,
    row: (key: string) => valuesOf(entityLimits, key),
  };
};

describe("validateEntityLimitValue", () => {
  test("accepts blank, or a number greater than zero, for a metric", () => {
    expect(validateEntityLimitValue("var", null)).toBeUndefined();
    expect(validateEntityLimitValue("var", 10)).toBeUndefined();
    expect(validateEntityLimitValue("var", 0)).toBe(
      "var must be a number greater than zero",
    );
    expect(validateEntityLimitValue("name", "anything")).toBeUndefined();
  });
});

describe("entities and entityLimits", () => {
  test("a row per entity, with its parent", async () => {
    const { entities, entityLimits, row } = await setup();
    expect(entities.rows).toHaveLength(12);
    expect(entityLimits.rows).toHaveLength(12);
    expect(row("DESK-EQD")).toMatchObject({
      entity_type: "Desk",
      name: "Equity derivatives",
      parent_id: "LE-UK",
    });
  });

  test("effective values are resolved down the tree", async () => {
    const { row } = await setup();
    // override: the nearest own value applies, higher or lower
    expect(row("LE-UK")).toMatchObject({
      max_order_qty: null,
      max_order_qty_eff: 1_000_000,
    });
    expect(row("BOOK-EQD-01").max_order_qty_eff).toBe(250_000);
    expect(row("BOOK-EQD-02").max_order_qty_eff).toBe(50_000);
    expect(row("BOOK-RATES-01").max_order_notional_eff).toBe(100_000_000);
    // cap: an entity can only go lower
    expect(row("BOOK-RATES-01").var_eff).toBe(4_000_000);
    expect(row("BOOK-CASH-01").drawdown_eff).toBe(500_000);
    expect(row("TRD-JSMITH").drawdown_eff).toBe(250_000);
  });

  test("only own values can be edited", async () => {
    const { editSession } = await setup();
    const { editCell } = await editSession();
    expect(await editCell("LE-UK", "var_eff", 1)).toMatchObject({
      type: "ERROR_RESULT",
    });
    expect(await editCell("LE-UK", "var", -1)).toMatchObject({
      type: "ERROR_RESULT",
    });
  });

  test("an edit session resolves its own effective values, then saves them", async () => {
    const { editSession, row } = await setup();
    const { editCell, save, sessionRow } = await editSession();
    expect(await editCell("LE-UK", "orders_per_sec", 300)).toMatchObject({
      type: "SUCCESS_RESULT",
    });
    expect(sessionRow("BOOK-CASH-01").orders_per_sec_eff).toBe(300);
    expect(sessionRow("BOOK-EQD-01").orders_per_sec_eff).toBe(200);
    expect(row("BOOK-CASH-01").orders_per_sec_eff).toBe(500);

    expect(await save()).toMatchObject({ type: "SUCCESS_RESULT" });
    expect(row("LE-UK").orders_per_sec).toBe(300);
    expect(row("BOOK-CASH-01").orders_per_sec_eff).toBe(300);
  });

  test("clearing an own value inherits the parent's again", async () => {
    const { editSession, row } = await setup();
    const { editCell, save, sessionRow } = await editSession();
    expect(await editCell("DESK-EQD", "max_order_qty", null)).toMatchObject({
      type: "SUCCESS_RESULT",
    });
    expect(sessionRow("DESK-EQD")).toMatchObject({
      max_order_qty: null,
      max_order_qty_eff: 1_000_000,
    });
    expect(sessionRow("BOOK-EQD-01").max_order_qty_eff).toBe(1_000_000);
    // a book that sets its own keeps it
    expect(sessionRow("BOOK-EQD-02").max_order_qty_eff).toBe(50_000);

    expect(await save()).toMatchObject({ type: "SUCCESS_RESULT" });
    expect(row("DESK-EQD").max_order_qty).toBe(null);
    expect(row("BOOK-EQD-01").max_order_qty_eff).toBe(1_000_000);
  });

  test("a broken cap is named in vuuMsg, and nothing is saved until it is fixed", async () => {
    const { editSession, row } = await setup();
    const { editCell, save, sessionRow } = await editSession();
    await editCell("DESK-RATES", "var", 6_000_000);
    await editCell("LE-UK", "max_order_qty", 750_000);
    expect(sessionRow("DESK-RATES").vuuMsg).toBe(
      "VaR 6000000 is above 4000000, the limit of LE-US",
    );
    expect(await save()).toEqual({
      type: "ERROR_RESULT",
      errorMessage:
        "nothing saved: VaR 6000000 is above 4000000, the limit of LE-US",
    });
    expect(row("LE-UK").max_order_qty).toBe(null);

    // raising the parent's cap fixes it
    await editCell("LE-US", "var", 8_000_000);
    expect(sessionRow("DESK-RATES").vuuMsg).toBe("");
    expect(await save()).toMatchObject({ type: "SUCCESS_RESULT" });
    expect(row("DESK-RATES").var_eff).toBe(6_000_000);
    expect(row("LE-UK").max_order_qty).toBe(750_000);
  });

  test("a cascade that breaks a cap below is named on the row below", async () => {
    const { editSession } = await setup();
    const { editCell, sessionRow } = await editSession();
    await editCell("DESK-EQD", "drawdown", 200_000);
    expect(sessionRow("TRD-JSMITH").vuuMsg).toBe(
      "Drawdown 250000 is above 200000, the limit of DESK-EQD",
    );
  });
});
