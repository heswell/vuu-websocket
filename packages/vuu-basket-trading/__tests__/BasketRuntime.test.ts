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
  lifecycles.push(lifecycle);
  const server = new VuuServer(
    VuuServerConfig(
      VuuWebSocketOptions().withWsPort(0).withSslDisabled(),
      {},
      LoginTokenService(),
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
  return { lifecycle, server, table, viewport, rpc, create };
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
    await first.rpc("basketTrading", "sendToMarket", { basketInstanceId: instanceId });
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
      RpcParams({ ric: "NEW.RIC" }, vp, RequestContext(
        "add", vp.user,
        { sessionId: vp.sessionId, channelId: "basket-runtime" },
        new OutboundRowPublishQueue(),
      )),
    );
    expect(result.type).toBe("SUCCESS_RESULT");
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
    expect(joined.getRowAtKey(`${instanceId}.NEW.RIC`)[joined.columnMap.ask]).toBeNull();
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

  test("all reference baskets round-trip with typed quantities and stable RICs", async () => {
    const path = snapshotPath();
    const runtime = await start(path);
    for (const sourceBasketId of [".HSI", ".NASDAQ100", ".FTSE100", ".SP500"]) {
      await runtime.rpc("basket", "createBasket", {
        sourceBasketId, basketTradeName: sourceBasketId,
      });
    }
    const constituents = runtime.table("basketTradingConstituent");
    expect(constituents.rows).toHaveLength(318);
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
      ]) {
        writeFileSync(path, contents);
        expect(() => BasketModule({ persistencePath: path })).toThrow();
        expect(readFileSync(path, "utf8")).toBe(contents);
      }
      expect(entries.filter(
        (entry) => entry.level === "error" && entry.name === "basket.persistence",
      )).toHaveLength(6);
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
