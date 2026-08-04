import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  LifecycleContainer,
  LoginTokenService,
  VuuServer,
  VuuServerConfig,
  VuuWebSocketOptions,
  type DataTable,
} from "@heswell/vuu-server";
import type { RpcParams } from "@heswell/vuu-server/src/net/rpc/Rpc";
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
      ).withModule(BasketModule()),
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
    expect(table("basketConstituent").rowCount).toBe(318);
    expect(table("prices").rowCount).toBe(303);
  });

  test("creates a trading basket and joins its constituents to BASKET prices", async () => {
    const sourceRows = table("basketConstituent").rows.filter(
      (row) => row[table("basketConstituent").columnMap.basketId] === ".NASDAQ100",
    );
    const result = await rpc("basket", "createBasket", {
      sourceBasketId: ".NASDAQ100",
      tradeBasketName: "NASDAQ trade",
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
    const joinedRow = joinTable.rowAt(0);
    expect(joinedRow[joinTable.columnMap.instanceId]).toBe(instanceId);
    expect(joinedRow[joinTable.columnMap.ric]).toBe(
      tradingConstituents[0][table("basketTradingConstituent").columnMap.ric],
    );
    expect(joinedRow[joinTable.columnMap.ask]).toBeNumber();
  });

  test("publishes market status changes", async () => {
    const createResult = await rpc("basket", "createBasket", {
      sourceBasketId: ".HSI",
      tradeBasketName: "HSI trade",
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

  test("rejects invalid requests and leaves state unchanged", async () => {
    const basketCount = table("basketTrading").rowCount;
    const constituentCount = table("basketTradingConstituent").rowCount;

    expect(
      await rpc("basket", "createBasket", {
        sourceBasketId: ".UNKNOWN",
        tradeBasketName: "Invalid",
      }),
    ).toEqual({
      type: "ERROR_RESULT",
      errorMessage: "Table getRowAtKey, no row at key .UNKNOWN",
    });
    expect(table("basketTrading").rowCount).toBe(basketCount);
    expect(table("basketTradingConstituent").rowCount).toBe(constituentCount);
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
