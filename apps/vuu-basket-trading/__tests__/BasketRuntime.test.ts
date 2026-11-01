import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  getLogSink,
  setLogSink,
  type LogEntry,
} from "@heswell/service-utils";
import {
  LifecycleContainer,
  LoginTokenService,
  OutboundRowPublishQueue,
  RequestContext,
  RpcParams,
  VuuServer,
  VuuServerConfig,
  VuuUser,
  VuuWebSocketOptions,
  type DataTable,
} from "@heswell/vuu-server";
import type { Table } from "@heswell/vuu-table";
import type { VuuServerMessage } from "@vuu-ui/vuu-protocol-types";
import { BasketModule } from "../src/modules/basket/BasketModule";
import { BasketPricesProvider } from "../src/modules/basket/providers/BasketPricesProvider";
import { BasketPersistence } from "../src/modules/basket/providers/BasketPersistence";

const directories: string[] = [];
const lifecycles: LifecycleContainer[] = [];

afterEach(async () => {
  for (const lifecycle of lifecycles.splice(0)) await lifecycle.destroy();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function snapshotPath() {
  const directory = mkdtempSync(join(tmpdir(), "basket-runtime-"));
  directories.push(directory);
  return join(directory, "nested", "baskets.json");
}

async function start(path?: string, intervalMs = 0) {
  const lifecycle = new LifecycleContainer();
  const loginTokens = LoginTokenService();
  lifecycles.push(lifecycle);
  const server = new VuuServer(
    VuuServerConfig(
      VuuWebSocketOptions().withWsPort(0).withSslDisabled(),
      {},
      loginTokens,
    ).withModule(BasketModule({
      persistencePath: path,
      priceSimulation: { intervalMs, updateProbability: 1, random: () => 0.4 },
    })),
    lifecycle,
  );
  await lifecycle.start();
  const table = (name: string) => server.tableContainer.getTable<Table & DataTable>(name);
  const session = { sessionId: "basket-runtime", channelId: "basket-runtime" };
  const user = VuuUser("trader");
  const queue = new OutboundRowPublishQueue();
  const ctx = RequestContext("runtime-test", user, session, queue);
  const viewport = (name: string) => server.viewPortContainer.create(
    "runtime-vp", user, session, queue, table(name),
    {
      type: "CREATE_VP",
      table: table(name).tableDef.asVuuTable,
      columns: table(name).schema.columns.map(({ name }) => name),
      aggregations: [],
      filterSpec: { filter: "" },
      groupBy: [],
      range: { from: 0, to: 1000 },
      sort: { sortDefs: [] },
    },
  );
  const rpc = async (name: string, rpcName: string, params: Record<string, unknown>) => {
    const vp = viewport(name);
    const result = await vp.viewPortDef.service.processRpcRequest(
      rpcName, RpcParams(params, vp, ctx),
    );
    if (result.type !== "SUCCESS_RESULT") throw new Error(result.errorMessage);
    return result.data;
  };
  const create = async () => {
    const result = await rpc("basket", "createBasket", {
      sourceBasketId: ".HSI",
      basketTradeName: "Persistent HSI",
    });
    if (typeof result !== "string") throw new Error("Missing basket key");
    return result;
  };
  return { lifecycle, server, table, viewport, rpc, create, loginTokens };
}

async function eventually(assertion: () => void) {
  const deadline = Date.now() + 2000;
  while (true) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await Bun.sleep(10);
    }
  }
}

describe("Basket backend parity", () => {
  test("uses complete canonical CSV membership, literal weights and weight-times-units quantities", async () => {
    const runtime = await start();
    const reference = runtime.table("basketConstituent");
    const base = runtime.table("basketTradingConstituent");
    const prices = runtime.table("prices");
    for (const [basketId, count] of [
      [".FTSE100", 98], [".HSI", 80], [".NASDAQ100", 101], [".SP500", 503],
    ] as const) {
      const instanceId = await runtime.rpc("basket", "createBasket", {
        sourceBasketId: basketId, basketTradeName: basketId,
      });
      const references = reference.rows.filter((row) =>
        row[reference.columnMap.basketId] === basketId,
      );
      const rows = base.rows.filter((row) => row[base.columnMap.instanceId] === instanceId);
      expect(references).toHaveLength(count);
      expect(rows).toHaveLength(count);
      for (const source of references) {
        const ric = String(source[reference.columnMap.ric]);
        const row = base.getRowAtKey(`${instanceId}-${ric}`);
        const weight = source[reference.columnMap.weighting];
        expect(row[base.columnMap.weighting]).toBe(weight);
        expect(row[base.columnMap.quantity]).toBe(Math.trunc(Number(weight) * 100));
        expect(row[base.columnMap.priceStrategyId]).toBe(2);
        expect(row[base.columnMap.status]).toBe("OFF-MARKET");
        expect(row[base.columnMap.orderStatus]).toBe("PENDING");
        expect(row[base.columnMap.filledQty]).toBe(0);
        expect(prices.getRowAtKey(ric)[prices.columnMap.ask]).toBeNumber();
      }
    }
    expect(reference.getRowAtKey("00001.HK-.HSI")[reference.columnMap.ric]).toBe("00001.HK");
    expect(reference.getRowAtKey("AAL.L-.FTSE100")[reference.columnMap.weighting]).toBe(0.0278736825813547);
    expect(reference.getRowAtKey("AAPL-.NASDAQ100")[reference.columnMap.weighting]).toBe(11.007);
    expect(reference.getRowAtKey("AAPL-.SP500")[reference.columnMap.weighting]).toBe(6.992488);
  });

  test("edits parent units and inverts mixed sides only for the target, with unchanged edits a no-op", async () => {
    const runtime = await start();
    const id = await runtime.create();
    const otherId = await runtime.create();
    const base = runtime.table("basketTradingConstituent");
    const rows = base.rows.filter((row) => row[base.columnMap.instanceId] === id);
    const keys = rows.slice(0, 2).map((row) => String(row[base.indexOfKeyField]));
    const other = base.rows.filter((row) => row[base.columnMap.instanceId] === otherId)
      .map((row) => row.slice());
    const edit = (column: string, data: unknown) =>
      runtime.rpc("basketTrading", "editCell", { key: id, column, data });
    await runtime.rpc("basketTradingConstituentJoin", "editRow", {
      key: keys[0], data: { weighting: 0.123, quantity: 777, side: "SELL" },
    });
    let parentUpdates = 0;
    let constituentUpdates = 0;
    runtime.table("basketTrading").addListener({ onUpdate: () => { parentUpdates++; } });
    base.addListener({ onUpdate: () => { constituentUpdates++; } });
    await edit("units", "100");
    await edit("side", "BUY");
    expect(parentUpdates).toBe(0);
    expect(constituentUpdates).toBe(0);
    expect(base.getRowAtKey(keys[0])[base.columnMap.quantity]).toBe(777);
    await edit("units", "250");
    for (const row of rows) {
      const updated = base.getRowAtKey(String(row[base.indexOfKeyField]));
      expect(updated[base.columnMap.quantity]).toBe(
        Math.trunc(Number(updated[base.columnMap.weighting]) * 250),
      );
    }
    expect(base.getRowAtKey(keys[0])[base.columnMap.quantity]).toBe(30);
    await edit("side", "SELL");
    expect(base.getRowAtKey(keys[0])[base.columnMap.side]).toBe("BUY");
    expect(base.getRowAtKey(keys[1])[base.columnMap.side]).toBe("SELL");
    await edit("side", "BUY");
    expect(base.getRowAtKey(keys[0])[base.columnMap.side]).toBe("SELL");
    expect(base.getRowAtKey(keys[1])[base.columnMap.side]).toBe("BUY");
    expect(base.rows.filter((row) => row[base.columnMap.instanceId] === otherId)).toEqual(other);
    const before = base.rows.map((row) => row.slice());
    for (const [column, data] of [
      ["units", 1.5], ["units", "bad"], ["side", "BAD"], ["basketId", ".NASDAQ100"],
      ["instanceId", "changed"],
    ]) {
      await expect(edit(String(column), data)).rejects.toThrow();
    }
    expect(base.rows).toEqual(before);
    expect(runtime.table("basketTrading").getRowAtKey(id)[
      runtime.table("basketTrading").columnMap.units
    ]).toBe(250);
  });

  test("targets explicit additions even from an unfiltered/empty viewport and uses current units", async () => {
    const runtime = await start();
    const id = await runtime.create();
    const otherId = await runtime.create();
    const base = runtime.table("basketTradingConstituent");
    const joined = runtime.table("basketTradingConstituentJoin");
    const add = (ric: string, basketInstanceId = id) =>
      runtime.rpc("basketTradingConstituentJoin", "addConstituent", { ric, basketInstanceId });
    await runtime.rpc("basketTrading", "editCell", { key: id, column: "units", data: 257 });
    const key = await add("AAPL");
    expect(key).toBe(`${id}-AAPL`);
    expect(joined.getRowAtKey(String(key))[joined.columnMap.quantity]).toBe(25);
    expect(joined.getRowAtKey(String(key))[joined.columnMap.limitPrice]).toBe(95);
    expect(joined.getRowAtKey(String(key))[joined.columnMap.ask]).toBeNumber();
    expect(base.getRowAtKey(`${otherId}-AAPL`, false)).toBeUndefined();
    const before = base.getRowAtKey(String(key)).slice();
    await expect(add("AAPL")).rejects.toThrow("AAPL is already in this basket");
    expect(base.getRowAtKey(String(key))).toEqual(before);
    await expect(add("UNKNOWN")).rejects.toThrow("Unknown constituent UNKNOWN");
    await expect(add("AAPL", "missing")).rejects.toThrow("Basket not found");
    await runtime.rpc("basketTrading", "sendToMarket", { basketInstanceId: id });
    for (const row of base.rows.filter((row) => row[base.columnMap.instanceId] === id)) {
      const projected = joined.getRowAtKey(String(row[base.indexOfKeyField]));
      expect(projected[joined.columnMap.status]).toBe("ON_MARKET");
      expect(projected[joined.columnMap.orderStatus]).toBe("ACKED");
      expect(projected[joined.columnMap.filledQty]).toBe(0);
    }
    expect(base.rows.filter((row) => row[base.columnMap.instanceId] === otherId)
      .every((row) => row[base.columnMap.orderStatus] === "PENDING")).toBe(true);
    await expect(add("MSFT")).rejects.toThrow("Take the basket off market");
    await runtime.rpc("basketTrading", "takeOffMarket", { basketInstanceId: id });
    expect(base.rows.filter((row) => row[base.columnMap.instanceId] === id)
      .every((row) => row[base.columnMap.status] === "OFF-MARKET" &&
        row[base.columnMap.orderStatus] === "CANCELLED")).toBe(true);
    // A basket with no constituents must still be a valid explicit target.
    for (const row of base.rows.filter((row) => row[base.columnMap.instanceId] === otherId)) {
      base.delete(String(row[base.indexOfKeyField]));
    }
    expect(await add("MSFT", otherId)).toBe(`${otherId}-MSFT`);
    expect(joined.getRowAtKey(`${otherId}-MSFT`)[joined.columnMap.quantity]).toBe(10);
    await runtime.rpc("basketTradingConstituentJoin", "editCell", {
      key: `${otherId}-MSFT`, column: "ric", data: "AAPL",
    });
    const renamed = base.getRowAtKey(`${otherId}-MSFT`).slice();
    await expect(add("MSFT", otherId)).rejects.toThrow("MSFT is already in this basket");
    expect(base.getRowAtKey(`${otherId}-MSFT`)).toEqual(renamed);
  });

  test("fans out price updates to every basket instance without losing source edits", async () => {
    const runtime = await start();
    const id = await runtime.create();
    const otherId = await runtime.create();
    const prices = runtime.table("prices");
    const joined = runtime.table("basketTradingConstituentJoin");
    const ric = "00001.HK";
    const first = `${id}-${ric}`;
    const second = `${otherId}-${ric}`;
    await runtime.rpc("basketTradingConstituentJoin", "editRow", {
      key: first, data: { weighting: 0.333, quantity: 456, limitPrice: 98.5 },
    });
    const price = prices.getRowAtKey(ric).slice();
    price[prices.columnMap.ask] = 123.45;
    prices.update(prices.rowIndexAtKey(ric), price, "ask");
    expect(joined.getRowAtKey(first)[joined.columnMap.ask]).toBe(123.45);
    expect(joined.getRowAtKey(second)[joined.columnMap.ask]).toBe(123.45);
    expect(joined.getRowAtKey(first)[joined.columnMap.quantity]).toBe(456);
    expect(joined.getRowAtKey(first)[joined.columnMap.weighting]).toBe(0.333);
    expect(joined.getRowAtKey(first)[joined.columnMap.limitPrice]).toBe(98.5);
    expect(joined.getRowAtKey(second)[joined.columnMap.quantity]).not.toBe(456);
  });

  test("publishes projected lookups and full filtered membership, including live insertions beyond the grid", async () => {
    const runtime = await start();
    const id = await runtime.create();
    const otherId = await runtime.create();
    const messages: VuuServerMessage[] = [];
    const socket = new WebSocket(`ws://localhost:${runtime.server.webSocketPort}/websocket`);
    const opened = new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("WebSocket failed")), { once: true });
    });
    socket.addEventListener("message", ({ data }) => {
      const received: VuuServerMessage | VuuServerMessage[] = JSON.parse(String(data));
      messages.push(...(Array.isArray(received) ? received : [received]));
    });
    let serial = 0;
    let sessionId = "";
    const request = async (body: unknown) => {
      const requestId = `wire-${++serial}`;
      socket.send(JSON.stringify({ body, requestId, sessionId, module: "CORE" }));
      await eventually(() => expect(messages.some((message) =>
        message.requestId === requestId && message.body.type !== "TABLE_ROW",
      )).toBe(true));
      const response = messages.find((message) =>
        message.requestId === requestId && message.body.type !== "TABLE_ROW",
      );
      if (!response) throw new Error(`Missing response ${requestId}`);
      return response;
    };
    const createVp = async (table: string, columns: string[], filter = "") => {
      const { body } = await request({
        type: "CREATE_VP", table: { module: "BASKET", table }, columns,
        aggregations: [], filterSpec: { filter }, groupBy: [],
        range: { from: 0, to: 5 }, sort: { sortDefs: [] },
      });
      if (body.type !== "CREATE_VP_SUCCESS") throw new Error(JSON.stringify(body));
      return body.viewPortId;
    };
    const rows = (id: string) => messages.flatMap(({ body }) =>
      body.type === "TABLE_ROW" ? body.rows.filter((row) => row.viewPortId === id) : [],
    );
    try {
      await opened;
      const login = await request({
        type: "LOGIN", token: runtime.loginTokens.getToken(VuuUser("wire-trader")),
      });
      expect(login.body.type).toBe("LOGIN_SUCCESS");
      sessionId = login.sessionId ?? "";
      const lookup = await createVp("priceStrategyType", ["id", "priceStrategy"]);
      await eventually(() => expect(rows(lookup).some((row) =>
        row.data[0] === 2 && row.data[1] === "Limit" && row.data.length === 2,
      )).toBe(true));
      const filter = `instanceId = "${id}"`;
      const grid = await createVp("basketTradingConstituentJoin", ["ric", "quantity"], filter);
      const membership = await createVp("basketTradingConstituentJoin", ["ric"], filter);
      await eventually(() => {
        expect(rows(membership).some((row) => row.vpSize === 80)).toBe(true);
        expect(rows(membership).filter((row) => row.updateType === "U")).toHaveLength(5);
      });
      expect((await request({
        type: "CHANGE_VP_RANGE", viewPortId: membership, from: 0, to: 80,
      })).body.type).toBe("CHANGE_VP_RANGE_SUCCESS");
      await eventually(() => expect(new Set(
        rows(membership).filter((row) => row.updateType === "U").map((row) => row.data[0]),
      ).size).toBe(80));
      const { body: added } = await request({
        type: "RPC_REQUEST", rpcName: "addConstituent",
        params: { ric: "AAPL", basketInstanceId: id },
        context: { type: "VIEWPORT_CONTEXT", viewPortId: grid },
      });
      expect(added.type).toBe("RPC_RESPONSE");
      if (added.type !== "RPC_RESPONSE") throw new Error(JSON.stringify(added));
      expect(added.result).toEqual({ type: "SUCCESS_RESULT", data: `${id}-AAPL` });
      await eventually(() => expect(rows(membership).some((row) => row.vpSize === 81)).toBe(true));
      await request({ type: "CHANGE_VP_RANGE", viewPortId: membership, from: 0, to: 81 });
      await eventually(() => expect(rows(membership).some((row) =>
        row.data.length === 1 && row.data[0] === "AAPL" && row.rowIndex === 80,
      )).toBe(true));
      expect(rows(grid).some((row) => row.data[0] === "AAPL")).toBe(false);
      await runtime.rpc("basketTradingConstituentJoin", "addConstituent", {
        ric: "MSFT", basketInstanceId: otherId,
      });
      await Bun.sleep(40);
      expect(rows(membership).some((row) => row.data[0] === "MSFT")).toBe(false);
      expect(rows(membership).filter((row) => row.updateType === "U")
        .every((row) => row.data.length === 1)).toBe(true);
      const base = runtime.table("basketTradingConstituent");
      const expected = new Set(base.rows.filter((row) =>
        row[base.columnMap.instanceId] === id,
      ).map((row) => row[base.columnMap.ric]));
      expect(new Set(rows(membership).filter((row) =>
        row.updateType === "U",
      ).map((row) => row.data[0]))).toEqual(expected);
    } finally {
      socket.close();
    }
  });
});

describe("Basket price simulation", () => {
  test("ticks quotes and joined rows, preserving edits, and stops with the lifecycle", async () => {
    const runtime = await start(undefined, 10);
    await runtime.create();
    const prices = runtime.table("prices");
    const joined = runtime.table("basketTradingConstituentJoin");
    const key = String(joined.rows[0][joined.indexOfKeyField]);
    await runtime.rpc("basketTradingConstituentJoin", "editCell", {
      key, column: "limitPrice", data: 42.5,
    });
    const vp = runtime.viewport("basketTradingConstituentJoin");
    vp.postDataForCurrentRange();
    const initial = joined.getRowAtKey(key).slice();
    await eventually(() => {
      const row = joined.getRowAtKey(key);
      expect(row[joined.columnMap.bid]).not.toBe(initial[joined.columnMap.bid]);
    });
    const updated = joined.getRowAtKey(key);
    expect(updated[joined.columnMap.limitPrice]).toBe(42.5);
    expect(updated[joined.columnMap.ask]).toBeGreaterThan(Number(updated[joined.columnMap.bid]));
    const published = vp.engine.getCurrentRange().rows.find(
      (row) => row.rowKey === key,
    );
    expect(published?.data[joined.columnMap.bid]).toBe(updated[joined.columnMap.bid]);
    expect(published?.data[joined.columnMap.limitPrice]).toBe(42.5);
    await runtime.lifecycle.stop();
    const stopped = prices.rows.map((row) => row.slice());
    await Bun.sleep(40);
    expect(prices.rows).toEqual(stopped);
  });

  test("supports walk, widening and fast ticks with positive uncrossed cent prices", async () => {
    const runtime = await start();
    const prices = runtime.table("prices");
    for (const mode of [0.4, 0.7, 0.9]) {
      const provider = new BasketPricesProvider(prices, [], {
        intervalMs: 0, updateProbability: 1, random: () => mode,
      });
      const original = prices.rows[0].slice();
      provider.runOnce();
      const row = prices.rows[0];
      expect(row[prices.columnMap.bid]).not.toBe(original[prices.columnMap.bid]);
      expect(row[prices.columnMap.open]).toBe(original[prices.columnMap.open]);
      expect(row[prices.columnMap.close]).toBe(original[prices.columnMap.close]);
      for (const row of prices.rows) {
        const bid = Number(row[prices.columnMap.bid]);
        const ask = Number(row[prices.columnMap.ask]);
        expect(bid).toBeGreaterThan(0);
        expect(ask).toBeGreaterThan(bid);
        expect(bid * 100).toBeCloseTo(Math.round(bid * 100), 8);
        expect(ask * 100).toBeCloseTo(Math.round(ask * 100), 8);
        expect(Number(row[prices.columnMap.bidSize])).toBeGreaterThan(0);
      }
    }
    const original = prices.rows.map((row) => row.slice());
    new BasketPricesProvider(prices, [], {
      intervalMs: 0, random: () => 0,
    }).runOnce();
    expect(prices.rows).toEqual(original);
    await Bun.sleep(30);
    expect(prices.rows).toEqual(original);
    expect(() => new BasketPricesProvider(prices, [], { intervalMs: -1 })).toThrow();
  });

  test("updates a sparse random subset without publishing unchanged prices", async () => {
    const runtime = await start();
    const prices = runtime.table("prices");
    const original = prices.rows.map((row) => row.slice());
    const updates: number[] = [];
    prices.addListener({ onUpdate: (index) => { updates.push(index); } });
    let index = 0;
    let remaining = 0;
    const provider = new BasketPricesProvider(prices, [], {
      intervalMs: 0,
      random: () => {
        if (remaining > 0) {
          remaining--;
          return 0.4;
        }
        const selected = index++ % 10 === 0;
        if (selected) remaining = 5;
        return selected ? 0.05 : 0.5;
      },
    });
    provider.runOnce();
    expect(updates).toEqual(
      original.map((_, index) => index).filter((index) => index % 10 === 0),
    );
    for (let index = 0; index < original.length; index++) {
      if (index % 10 === 0) {
        expect(prices.rows[index]).not.toEqual(original[index]);
      } else {
        expect(prices.rows[index]).toEqual(original[index]);
      }
    }
    const after = prices.rows.map((row) => row.slice());
    new BasketPricesProvider(prices, [], {
      intervalMs: 0, updateProbability: 0, random: () => 0,
    }).runOnce();
    expect(prices.rows).toEqual(after);
    for (const updateProbability of [-0.1, 1.1, NaN, Infinity]) {
      expect(() => new BasketPricesProvider(prices, [], {
        updateProbability,
      })).toThrow("updateProbability must be between zero and one");
    }
  });
});

describe("Basket JSON persistence", () => {
  test("auto-saves both source tables and restores edits, status and joined prices after restart", async () => {
    const path = snapshotPath();
    const first = await start(path);
    const instanceId = await first.create();
    const base = first.table("basketTradingConstituent");
    const key = String(base.rows[0][base.indexOfKeyField]);
    await first.rpc("basketTradingConstituentJoin", "editRow", {
      key, data: { limitPrice: 12.5, weighting: 0.2, side: "SELL" },
    });
    for (const [column, data] of [
      ["instanceId", "missing-basket"], ["basketId", ".UNKNOWN"],
    ]) {
      await expect(first.rpc("basketTradingConstituentJoin", "editCell", {
        key, column, data,
      })).rejects.toThrow("A constituent must reference an existing trading basket");
    }
    const vp = first.viewport("basketTradingConstituentJoin");
    const result = await vp.viewPortDef.service.processRpcRequest(
      "addConstituent",
      RpcParams({ ric: "AAPL", basketInstanceId: instanceId }, vp, RequestContext(
        "add", vp.user,
        { sessionId: vp.sessionId, channelId: "basket-runtime" },
        new OutboundRowPublishQueue(),
      )),
    );
    expect(result.type).toBe("SUCCESS_RESULT");
    await first.rpc("basketTrading", "sendToMarket", { basketInstanceId: instanceId });
    await eventually(() => {
      const snapshot = JSON.parse(readFileSync(path, "utf8"));
      expect(snapshot.tables.basketTradingConstituent[0].limitPrice).toBe(12.5);
    });
    const before = {
      baskets: first.table("basketTrading").rows.map((row) => row.slice()),
      constituents: base.rows.map((row) => row.slice()),
    };
    const snapshot = JSON.parse(readFileSync(path, "utf8"));
    expect(snapshot.version).toBe(1);
    expect(Object.keys(snapshot.tables).sort()).toEqual([
      "basketTrading", "basketTradingConstituent",
    ]);
    expect(snapshot.tables.basketTrading[0].basketName).toBe("Persistent HSI");
    expect(snapshot.tables.basketTrading[0].status).toBe("ON_MARKET");
    expect(readdirSync(join(path, ".."))).toEqual(["baskets.json"]);
    await first.lifecycle.destroy();

    const second = await start(path);
    expect(second.table("basketTrading").rows).toEqual(before.baskets);
    expect(second.table("basketTradingConstituent").rows).toEqual(before.constituents);
    const joined = second.table("basketTradingConstituentJoin");
    expect(joined.getRowAtKey(key)[joined.columnMap.limitPrice]).toBe(12.5);
    expect(joined.getRowAtKey(key)[joined.columnMap.ask]).toBeNumber();
    expect(joined.getRowAtKey(`${instanceId}-AAPL`)[joined.columnMap.ask]).toBeNumber();
    expect(joined.getRowAtKey(`${instanceId}-AAPL`)[joined.columnMap.orderStatus]).toBe("ACKED");
    const nextId = await second.create();
    expect(nextId).not.toBe(instanceId);
    expect(second.table("basketTrading").getRowAtKey(instanceId)).toEqual(before.baskets[0]);
  });

  test("flushes pending changes on shutdown and persists deletions", async () => {
    const path = snapshotPath();
    const runtime = await start(path);
    const key = await runtime.create();
    const base = runtime.table("basketTradingConstituent");
    const deleted = String(base.rows[0][base.indexOfKeyField]);
    base.delete(deleted);
    await runtime.lifecycle.destroy();
    const restored = await start(path);
    expect(restored.table("basketTrading").getRowAtKey(key)).toBeDefined();
    expect(restored.table("basketTradingConstituent").getRowAtKey(deleted, false)).toBeUndefined();
  });

  test("restores legacy execution-field-free snapshots without changing user data or keys", async () => {
    const path = snapshotPath();
    const runtime = await start(path);
    const id = await runtime.create();
    const base = runtime.table("basketTradingConstituent");
    const key = String(base.rows[0][base.indexOfKeyField]);
    await runtime.rpc("basketTradingConstituentJoin", "editRow", {
      key, data: { quantity: 7654, weighting: 0.876, side: "SELL" },
    });
    await runtime.lifecycle.destroy();
    const snapshot = JSON.parse(readFileSync(path, "utf8"));
    for (const row of snapshot.tables.basketTradingConstituent) {
      delete row.orderStatus;
      delete row.filledQty;
    }
    const saved = snapshot.tables.basketTradingConstituent[0];
    saved.instanceIdRic = `${id}.${saved.ric}`;
    saved.status = "ON_MARKET";
    writeFileSync(path, JSON.stringify(snapshot));
    const restored = await start(path);
    const rows = restored.table("basketTradingConstituent");
    const row = rows.getRowAtKey(saved.instanceIdRic);
    expect(row[rows.columnMap.quantity]).toBe(7654);
    expect(row[rows.columnMap.weighting]).toBe(0.876);
    expect(row[rows.columnMap.side]).toBe("SELL");
    expect(row[rows.columnMap.orderStatus]).toBe("ACKED");
    expect(row[rows.columnMap.filledQty]).toBe(0);
    const count = rows.rows.length;
    await expect(restored.rpc("basketTradingConstituentJoin", "addConstituent", {
      ric: saved.ric, basketInstanceId: id,
    })).rejects.toThrow("is already in this basket");
    expect(rows.rows).toHaveLength(count);
  });

  test("all reference baskets round-trip with typed quantities and stable RICs", async () => {
    const path = snapshotPath();
    const runtime = await start(path);
    for (const sourceBasketId of [".HSI", ".NASDAQ100", ".FTSE100", ".SP500"]) {
      await runtime.rpc("basket", "createBasket", {
        sourceBasketId, basketTradeName: sourceBasketId,
      });
    }
    const constituents = runtime.table("basketTradingConstituent");
    expect(constituents.rows).toHaveLength(782);
    const rics = constituents.rows.map((row) => row[constituents.columnMap.ric]);
    expect(rics).toContain("00005.HK");
    expect(rics).toContain("KDP");
    for (const row of constituents.rows) {
      expect(Number.isSafeInteger(row[constituents.columnMap.quantity])).toBe(true);
      expect(row[constituents.columnMap.priceStrategyId]).toBe(2);
    }
    const snapshot = constituents.rows.map((row) => row.slice());
    await runtime.lifecycle.destroy();
    const restored = await start(path);
    expect(restored.table("basketTradingConstituent").rows).toEqual(snapshot);
  });

  test("does not rewrite the basket snapshot when only prices tick", async () => {
    const path = snapshotPath();
    const runtime = await start(path, 10);
    await runtime.create();
    await eventually(() => expect(existsSync(path)).toBe(true));
    const snapshot = readFileSync(path, "utf8");
    const inode = statSync(path).ino;
    const originalPrice = runtime.table("prices").rows[0].slice();
    await Bun.sleep(150);
    expect(runtime.table("prices").rows[0]).not.toEqual(originalPrice);
    expect(readFileSync(path, "utf8")).toBe(snapshot);
    expect(statSync(path).ino).toBe(inode);
  });

  test("rejects corrupt, unsupported, invalid and orphaned snapshots without overwriting", async () => {
    const path = snapshotPath();
    const runtime = await start(path);
    await runtime.create();
    await runtime.lifecycle.destroy();
    const valid = readFileSync(path, "utf8");
    const invalidRow = JSON.parse(valid);
    invalidRow.tables.basketTradingConstituent[0].limitPrice = "invalid";
    const duplicate = JSON.parse(valid);
    duplicate.tables.basketTrading.push(duplicate.tables.basketTrading[0]);
    const orphan = JSON.parse(valid);
    orphan.tables.basketTrading = [];
    const missingColumn = JSON.parse(valid);
    delete missingColumn.tables.basketTradingConstituent[0].filledQty;
    const extraColumn = JSON.parse(valid);
    extraColumn.tables.basketTradingConstituent[0].unknown = 0;
    const entries: LogEntry[] = [];
    const sink = getLogSink();
    setLogSink((entry) => entries.push(entry));
    try {
      for (const contents of [
        "{",
        JSON.stringify({ version: 2, tables: {} }),
        JSON.stringify({ version: 1, tables: {} }),
        JSON.stringify(invalidRow),
        JSON.stringify(duplicate),
        JSON.stringify(orphan),
        JSON.stringify(missingColumn),
        JSON.stringify(extraColumn),
      ]) {
        writeFileSync(path, contents);
        expect(() => BasketModule({ persistencePath: path })).toThrow();
        expect(readFileSync(path, "utf8")).toBe(contents);
      }
      expect(entries.filter(
        (entry) => entry.level === "error" && entry.name === "basket.persistence",
      )).toHaveLength(8);
    } finally {
      setLogSink(sink);
    }
  });

  test("logs save failures and retries successfully", async () => {
    const path = snapshotPath();
    const runtime = await start(path);
    await runtime.create();
    await eventually(() => expect(existsSync(path)).toBe(true));
    const blocker = join(path, "..", "blocked");
    const persistence = new BasketPersistence(join(blocker, "snapshot.json"));
    persistence.attach(runtime.table("basketTrading"));
    persistence.attach(runtime.table("basketTradingConstituent"));
    writeFileSync(blocker, "not a directory");
    const entries: LogEntry[] = [];
    const sink = getLogSink();
    setLogSink((entry) => entries.push(entry));
    try {
      const table = runtime.table("basketTrading");
      const row = table.rows[0].slice();
      row[table.columnMap.basketName] = "Autosave failure";
      table.update(0, row);
      await eventually(() => expect(entries.some(
        (entry) => entry.name === "basket.persistence" && entry.level === "error",
      )).toBe(true));
      unlinkSync(blocker);
      await eventually(() => {
        const saved = JSON.parse(readFileSync(join(blocker, "snapshot.json"), "utf8"));
        expect(saved.tables.basketTrading[0].basketName).toBe("Autosave failure");
      });
    } finally {
      persistence.stop();
      setLogSink(sink);
    }
  });
});
