import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  type DataTable,
  LifecycleContainer,
  LoginTokenService,
  OutboundRowPublishQueue,
  PermissionFilter,
  RequestContext,
  RpcParams,
  VuuServer,
  VuuServerConfig,
  VuuUser,
  ViewPortSelection,
  VuuWebSocketOptions,
} from "@heswell/vuu-server";
import type { RpcResult } from "@vuu-ui/vuu-protocol-types";
import { BasketModule } from "../src/modules/basket/BasketModule";

describe("BasketModule", () => {
  let lifecycle: LifecycleContainer;
  let server: VuuServer;

  beforeAll(async () => {
    lifecycle = new LifecycleContainer();
    server = new VuuServer(
      VuuServerConfig(
        VuuWebSocketOptions().withWsPort(0).withSslDisabled(),
        {},
        LoginTokenService(),
      ).withModule(BasketModule({ priceSimulation: { intervalMs: 0 } })),
      lifecycle,
    );
    await lifecycle.start();
  });

  afterAll(async () => {
    await lifecycle.stop();
  });

  test("registers all basket tables in one namespace", () => {
    expect(server.tableContainer.getDefinedTables()).toEqual([
      { module: "BASKET", table: "algoType" },
      { module: "BASKET", table: "basket" },
      { module: "BASKET", table: "basketConstituent" },
      { module: "BASKET", table: "basketTrading" },
      { module: "BASKET", table: "basketTradingConstituent" },
      { module: "BASKET", table: "prices" },
      { module: "BASKET", table: "priceStrategyType" },
      { module: "BASKET", table: "basketTradingConstituentJoin" },
    ]);
  });

  test("loads canonical lookup and basket data", () => {
    expect(table("algoType").rows).toEqual([
      ["Sniper", 0],
      ["Dark Liquidity", 1],
      ["VWAP", 2],
      ["POV", 3],
      ["Dynamic Close", 4],
    ]);
    expect(table("basket").rows).toEqual([
      [".NASDAQ100", ".NASDAQ100", 0, 0],
      [".HSI", ".HSI", 0, 0],
      [".FTSE100", ".FTSE100", 0, 0],
      [".SP500", ".SP500", 0, 0],
    ]);
    expect(table("basketConstituent").rows.length).toBe(782);
    expect(table("prices").rows.length).toBe(699);
  });

  test("creates a trading basket and joins its constituents to BASKET prices", async () => {
    const sourceRows = table("basketConstituent").rows.filter(
      (row) => row[table("basketConstituent").columnMap.basketId] === ".NASDAQ100",
    );
    const result = await rpc("basket", "createBasket", {
      sourceBasketId: ".NASDAQ100",
      basketTradeName: "NASDAQ trade",
    });

    expect(result.type).toBe("SUCCESS_RESULT");
    const instanceId = result.type === "SUCCESS_RESULT"
      ? result.data as string
      : "";
    expect(instanceId).toMatch(/^steve-\d+$/);
    expect(table("basketTrading").getRowAtKey(instanceId)).toEqual([
      ".NASDAQ100",
      "NASDAQ trade",
      0,
      1.25,
      instanceId,
      "BUY",
      "OFF MARKET",
      1_000_000,
      1_250_000,
      100,
    ]);

    const tradingConstituents = table("basketTradingConstituent").rows.filter(
      (row) =>
        row[table("basketTradingConstituent").columnMap.instanceId] === instanceId,
    );
    expect(tradingConstituents).toHaveLength(sourceRows.length);

    const joinTable = table("basketTradingConstituentJoin");
    const joinedRow = joinTable.rows[0];
    expect(joinedRow[joinTable.columnMap.instanceId]).toBe(instanceId);
    expect(joinedRow[joinTable.columnMap.ric]).toBe(
      tradingConstituents[0][table("basketTradingConstituent").columnMap.ric],
    );
    expect(joinedRow[joinTable.columnMap.ask]).toBeNumber();
  });

  test("publishes market status changes", async () => {
    const createResult = await rpc("basket", "createBasket", {
      sourceBasketId: ".HSI",
      basketTradeName: "HSI trade",
    });
    const instanceId = createResult.type === "SUCCESS_RESULT"
      ? createResult.data as string
      : "";

    expect(
      await rpc("basketTrading", "sendToMarket", { basketInstanceId: instanceId }),
    ).toEqual({ type: "SUCCESS_RESULT", data: undefined });
    expect(
      table("basketTrading").getRowAtKey(instanceId)[
        table("basketTrading").columnMap.status
      ],
    ).toBe("ON_MARKET");

    await rpc("basketTrading", "takeOffMarket", {
      basketInstanceId: instanceId,
    });
    expect(
      table("basketTrading").getRowAtKey(instanceId)[
        table("basketTrading").columnMap.status
      ],
    ).toBe("OFF-MARKET");
  });

  test("edits joined trading fields directly and preserves them across price updates", async () => {
    const { edit, key } = await constituentEditor();
    const base = table("basketTradingConstituent");
    const joined = table("basketTradingConstituentJoin");
    const expected = base.getRowAtKey(key).slice();

    for (const [column, data, value] of [
      ["weighting", 2, 2],
      ["weighting", "0.25", 0.25],
      ["limitPrice", 100, 100],
      ["limitPrice", 100.5, 100.5],
      ["quantity", "1234", 1234],
      ["priceStrategyId", "2", 2],
      ["side", "SELL", "SELL"],
      ["algo", "VWAP", "VWAP"],
    ] as const) {
      expect(await edit(column, data)).toEqual({
        type: "SUCCESS_RESULT",
        data: undefined,
      });
      expected[base.columnMap[column]] = value;
      expect(base.getRowAtKey(key)).toEqual(expected);
      expect(joined.getRowAtKey(key)[joined.columnMap[column]]).toBe(value);
    }

    const prices = table("prices");
    const ric = expected[base.columnMap.ric] as string;
    const priceRow = prices.getRowAtKey(ric).slice();
    priceRow[prices.columnMap.ask] = 123.45;
    prices.update(prices.rowIndexAtKey(ric), priceRow, "ask");

    expect(joined.getRowAtKey(key)[joined.columnMap.ask]).toBe(123.45);
    for (const column of ["weighting", "limitPrice", "quantity", "side"]) {
      expect(joined.getRowAtKey(key)[joined.columnMap[column]]).toBe(
        expected[base.columnMap[column]],
      );
    }
  });

  test("rejects invalid joined edits without changing source or joined rows", async () => {
    const { edit, key } = await constituentEditor();
    const base = table("basketTradingConstituent");
    const joined = table("basketTradingConstituentJoin");
    const originalBase = base.getRowAtKey(key).slice();
    const originalJoin = joined.getRowAtKey(key).slice();
    const originalPrices = table("prices").rows.map((row) => row.slice());

    for (const [column, data, errorMessage] of [
      ["ask", 99, "editCell: column ask is not editable"],
      ["bid", 99, "editCell: column bid is not editable"],
      ["instanceIdRic", "new-key", "editCell: column instanceIdRic is not editable"],
      ["unknown", 1, "editCell: column unknown not found"],
      ["limitPrice", "invalid", "editCell: invalid value for column limitPrice (double)"],
      ["quantity", 1.5, "editCell: invalid value for column quantity (long)"],
    ] as const) {
      expect(await edit(column, data)).toEqual({
        type: "ERROR_RESULT",
        errorMessage,
      });
      expect(base.getRowAtKey(key)).toEqual(originalBase);
      expect(joined.getRowAtKey(key)).toEqual(originalJoin);
      expect(table("prices").rows).toEqual(originalPrices);
    }
    expect(await edit("limitPrice", 99, "missing-key")).toEqual({
      type: "ERROR_RESULT",
      errorMessage: "editCell: row missing-key not found",
    });
  });

  test("enforces joined viewport permissions for direct edits", async () => {
    const { edit, key, viewport } = await constituentEditor();
    const base = table("basketTradingConstituent");
    const original = base.getRowAtKey(key).slice();
    viewport.permissionFilter = PermissionFilter("side", new Set(["BUY"]));
    expect(await edit("side", "SELL")).toEqual({
      type: "ERROR_RESULT",
      errorMessage: `editCell: edit would make row ${key} inaccessible to the user`,
    });
    viewport.permissionFilter = PermissionFilter("side", new Set(["SELL"]));
    expect(await edit("limitPrice", 99)).toEqual({
      type: "ERROR_RESULT",
      errorMessage: `editCell: row ${key} not found`,
    });
    expect(base.getRowAtKey(key)).toEqual(original);
  });

  test("writes editRow through to the base and validates all fields before mutation", async () => {
    const { call, key } = await constituentEditor();
    const base = table("basketTradingConstituent");
    const joined = table("basketTradingConstituentJoin");
    expect(await call("editRow", {
      key, data: { instanceIdRic: key, side: "SELL", limitPrice: "12.5", weighting: 2 },
    })).toEqual({ type: "SUCCESS_RESULT", data: undefined });
    for (const [column, value] of [["side", "SELL"], ["limitPrice", 12.5], ["weighting", 2]] as const) {
      expect(base.getRowAtKey(key)[base.columnMap[column]]).toBe(value);
      expect(joined.getRowAtKey(key)[joined.columnMap[column]]).toBe(value);
    }
    const original = base.getRowAtKey(key).slice();
    for (const data of [
      { side: "BUY", limitPrice: "invalid" },
      { side: "BUY", ask: 1 },
      { instanceIdRic: "changed-key" },
      {},
      null,
    ]) {
      expect((await call("editRow", { key, data })).type).toBe("ERROR_RESULT");
      expect(base.getRowAtKey(key)).toEqual(original);
    }
    expect((await call("editRow", {
      key: "missing", data: { side: "BUY" },
    })).type).toBe("ERROR_RESULT");
  });

  test("checks resulting price permissions when changing a constituent RIC", async () => {
    const { edit, key, viewport } = await constituentEditor();
    const base = table("basketTradingConstituent");
    const joined = table("basketTradingConstituentJoin");
    const prices = table("prices");
    const original = base.getRowAtKey(key).slice();
    const ask = joined.getRowAtKey(key)[joined.columnMap.ask];
    const otherPrice = prices.rows.find(
      (row) => row[prices.columnMap.ask] !== ask,
    )!;
    viewport.permissionFilter = PermissionFilter("ask", new Set([String(ask)]));
    expect((await edit("ric", otherPrice[prices.columnMap.ric])).type).toBe("ERROR_RESULT");
    expect(base.getRowAtKey(key)).toEqual(original);
  });

  test("supports Scala direction RPCs and selection menus", async () => {
    const { call, key, viewport, ctx, instanceId } = await constituentEditor();
    const base = table("basketTradingConstituent");
    const rows = base.rows.filter((row) => row[base.columnMap.instanceId] === instanceId);
    const secondKey = rows[1][base.indexOfKeyField] as string;
    const untouchedKey = rows[2][base.indexOfKeyField] as string;
    const keys = new Set([key, secondKey]);
    const selection = ViewPortSelection(keys, viewport);
    expect(await call("setSell", { selection })).toEqual({
      type: "SUCCESS_RESULT", data: undefined,
    });
    for (const rowKey of keys) {
      expect(base.getRowAtKey(rowKey)[base.columnMap.side]).toBe("SELL");
    }
    expect(base.getRowAtKey(untouchedKey)[base.columnMap.side]).toBe("BUY");
    expect(await call("setBuy", { selection })).toEqual({
      type: "SUCCESS_RESULT", data: undefined,
    });
    viewport.selectRow(key, false);
    viewport.selectRow(secondKey, true);
    expect(viewport.viewPortDef.service.menuItems.asJson).toEqual({
      name: "Direction",
      menus: [
        { context: "selected-rows", name: "Set Sell", filter: "", rpcName: "SET_SELECTION_SELL" },
        { context: "selected-rows", name: "Set Buy", filter: "", rpcName: "SET_SELECTION_Buy" },
      ],
    });
    for (const [rpcName, side] of [
      ["SET_SELECTION_SELL", "SELL"], ["SET_SELECTION_Buy", "BUY"],
    ]) {
      expect(await server.viewPortContainer.callMenuRpc({
        type: "VIEW_PORT_MENUS_SELECT_RPC", vpId: viewport.id, rpcName,
      }, ctx)).toEqual({ type: "NO_ACTION" });
      for (const rowKey of keys) {
        expect(base.getRowAtKey(rowKey)[base.columnMap.side]).toBe(side);
      }
    }
    expect(await call("setSell", {})).toEqual({
      type: "SUCCESS_RESULT", data: undefined,
    });
    expect(base.getRowAtKey(key)[base.columnMap.side]).toBe("SELL");
    expect(base.getRowAtKey(secondKey)[base.columnMap.side]).toBe("SELL");
  });

  test("validates every selected row before changing directions", async () => {
    const { call, key, viewport, ctx } = await constituentEditor();
    const base = table("basketTradingConstituent");
    const original = base.getRowAtKey(key).slice();
    expect((await call("setSell", {
      selection: ViewPortSelection(new Set([key, "missing"]), viewport),
    })).type).toBe("ERROR_RESULT");
    expect(base.getRowAtKey(key)).toEqual(original);
    expect((await call("setSell", { selection: ["invalid"] })).type).toBe("ERROR_RESULT");
    viewport.permissionFilter = PermissionFilter("side", new Set(["BUY"]));
    viewport.selectRow(key, false);
    const action = await server.viewPortContainer.callMenuRpc({
      type: "VIEW_PORT_MENUS_SELECT_RPC", vpId: viewport.id, rpcName: "SET_SELECTION_SELL",
    }, ctx);
    expect(action.type).toBe("SHOW_NOTIFICATION_ACTION");
    expect(base.getRowAtKey(key)).toEqual(original);
  });

  test("adds constituents to the explicit basket and publishes joined rows", async () => {
    const { call, instanceId } = await constituentEditor();
    const base = table("basketTradingConstituent");
    const joined = table("basketTradingConstituentJoin");
    const reference = table("basketConstituent");
    const source = reference.rows.find((row) =>
      row[reference.columnMap.basketId] === ".NASDAQ100",
    )!;
    const ric = source[reference.columnMap.ric] as string;
    const key = `${instanceId}-${ric}`;
    expect(await call("addConstituent", { ric, basketInstanceId: instanceId })).toEqual({
      type: "SUCCESS_RESULT", data: key,
    });
    const row = base.getRowAtKey(key);
    expect(row[base.columnMap.instanceId]).toBe(instanceId);
    expect(row[base.columnMap.basketId]).toBe(".HSI");
    expect(row[base.columnMap.description]).toBe(source[reference.columnMap.description]);
    for (const [column, value] of [
      ["quantity", 10], ["weighting", 0.1], ["side", "BUY"],
      ["priceStrategyId", 2], ["algo", ""], ["orderStatus", "PENDING"], ["filledQty", 0],
    ] as const) {
      expect(row[base.columnMap[column]]).toBe(value);
      expect(joined.getRowAtKey(key)[joined.columnMap[column]]).toBe(value);
    }
    expect(joined.getRowAtKey(key)[joined.columnMap.ask]).toBeNumber();
    const count = base.rows.length;
    expect(await call("addConstituent", { ric, basketInstanceId: instanceId })).toEqual({
      type: "ERROR_RESULT", errorMessage: `${ric} is already in this basket`,
    });
    expect(base.rows.length).toBe(count);
    expect(await call("addConstituent", {
      ric: "UNKNOWN.RIC", basketInstanceId: instanceId,
    })).toEqual({
      type: "ERROR_RESULT", errorMessage: "Unknown constituent UNKNOWN.RIC",
    });
    expect(base.rows.length).toBe(count);
  });

  test("rejects invalid, missing-target or inaccessible constituent additions", async () => {
    const { call, key, instanceId, viewport } = await constituentEditor();
    const base = table("basketTradingConstituent");
    const count = base.rows.length;
    for (const ric of [undefined, "", "   ", 123]) {
      expect((await call("addConstituent", { ric, basketInstanceId: instanceId })).type).toBe("ERROR_RESULT");
    }
    expect(await call("addConstituent", { ric: "AAPL" })).toEqual({
      type: "ERROR_RESULT", errorMessage: "Invalid add constituent request",
    });
    expect(await call("addConstituent", { ric: "AAPL", basketInstanceId: "missing" })).toEqual({
      type: "ERROR_RESULT", errorMessage: "Basket not found",
    });
    viewport.permissionFilter = PermissionFilter("ric", new Set([
      base.getRowAtKey(key)[base.columnMap.ric] as string,
    ]));
    expect((await call("addConstituent", {
      ric: "AAPL", basketInstanceId: instanceId,
    })).type).toBe("ERROR_RESULT");
    expect(base.rows.length).toBe(count);
  });

  test("rejects invalid requests and leaves state unchanged", async () => {
    const basketCount = table("basketTrading").rows.length;
    const constituentCount = table("basketTradingConstituent").rows.length;

    expect(
      await rpc("basket", "createBasket", {
        sourceBasketId: ".UNKNOWN",
        basketTradeName: "Invalid",
      }),
    ).toEqual({
      type: "ERROR_RESULT",
      errorMessage: "Table getRowAtKey, no row at key .UNKNOWN",
    });
    expect(table("basketTrading").rows.length).toBe(basketCount);
    expect(table("basketTradingConstituent").rows.length).toBe(constituentCount);
    expect(
      await rpc(
        "basketTradingConstituent",
        "addConstituent",
        {},
      ),
    ).toEqual({
      type: "ERROR_RESULT",
      errorMessage: "addConstituent not implemented",
    });
  });

  test("requires the Scala basketTradeName parameter without mutating state", async () => {
    const basketCount = table("basketTrading").rows.length;
    const constituentCount = table("basketTradingConstituent").rows.length;

    for (const params of [
      {},
      { basketTradeName: "" },
      { basketTradeName: "   " },
      { basketTradeName: 123 },
      { tradeBasketName: "Legacy name" },
    ]) {
      expect(
        await rpc("basket", "createBasket", {
          sourceBasketId: ".NASDAQ100",
          ...params,
        }),
      ).toEqual({
        type: "ERROR_RESULT",
        errorMessage: 'Invalid RPC param "basketTradeName"',
      });
      expect(table("basketTrading").rows.length).toBe(basketCount);
      expect(table("basketTradingConstituent").rows.length).toBe(constituentCount);
    }
  });

  test("exposes the basket visual link and menu", () => {
    expect(table("basketConstituent").tableDef.links.links).toEqual([
      { fromColumn: "basketId", toTable: "basket", toColumn: "id" },
    ]);
    expect(
      server.viewPortContainer.getViewPortDefinition(table("basket")).service
        .menuItems.asJson,
    ).toEqual({
      name: "ROOT",
      menus: [
        {
          context: "selected-rows",
          filter: "",
          name: "Add Basket",
          rpcName: "CREATE_NEW_BASKET",
        },
      ],
    });
  });

  function table(name: string) {
    return server.tableContainer.getTable<DataTable>(name);
  }

  async function constituentEditor() {
    const result = await rpc("basket", "createBasket", {
      sourceBasketId: ".HSI",
      basketTradeName: "Editable HSI trade",
    });
    if (result.type !== "SUCCESS_RESULT") {
      throw new Error(result.errorMessage);
    }
    if (typeof result.data !== "string") {
      throw new Error("Missing trading basket instance ID");
    }
    const instanceId = result.data;
    const base = table("basketTradingConstituent");
    const row = base.rows.find(
      (row) => row[base.columnMap.instanceId] === instanceId,
    );
    if (!row) throw new Error("Missing trading constituent");
    const key = row[base.indexOfKeyField] as string;
    const joined = table("basketTradingConstituentJoin");
    const user = VuuUser("basket-trader");
    const session = { sessionId: `session-${key}`, channelId: `channel-${key}` };
    const queue = new OutboundRowPublishQueue();
    const ctx = RequestContext("edit-request", user, session, queue);
    const viewport = server.viewPortContainer.create(
      "create-request",
      user,
      session,
      queue,
      joined,
      {
        type: "CREATE_VP",
        table: joined.tableDef.asVuuTable,
        columns: joined.schema.columns.map(({ name }) => name),
        aggregations: [],
        filterSpec: { filter: `instanceId = "${instanceId}"` },
        groupBy: [],
        range: { from: 0, to: 100 },
        sort: { sortDefs: [] },
      },
    );
    return {
      key,
      instanceId,
      viewport,
      ctx,
      call: (rpcName: string, namedParams: Record<string, unknown>) =>
        viewport.viewPortDef.service.processRpcRequest(
          rpcName, RpcParams(namedParams, viewport, ctx),
        ),
      edit: (column: string, data: unknown, rowKey = key) =>
        viewport.viewPortDef.service.processRpcRequest(
          "editCell",
          RpcParams({ key: rowKey, column, data }, viewport, ctx),
        ),
    };
  }

  function rpc(
    tableName: string,
    rpcName: string,
    namedParams: Record<string, unknown>,
  ): RpcResult | Promise<RpcResult> {
    const service = server.viewPortContainer.getViewPortDefinition(
      table(tableName),
    ).service;
    return service.processRpcRequest(rpcName, {
      namedParams,
    } as RpcParams);
  }
});
