import { afterAll, describe, expect, test } from "bun:test";
import { start as startPrices } from "../packages/price-service/src/server";
import { start as startRefData } from "../packages/reference-data-service/src/server";
import {
  createRecorder,
  quiet,
  round,
  sample,
  waitFor,
  WireClient,
  WireTap,
} from "./harness";

/**
 * Cost and benefit of websocket permessage-deflate
 * (DATA_SERVICE_COMPRESSION=1). Bytes are measured on the wire by a
 * proxy; compare with the uncompressed metrics in services.perf.test.ts.
 */

const record = createRecorder();

const PRICE_UPDATES = 10_000;

/** services read DATA_SERVICE_COMPRESSION when constructed */
const compressed = <T>(start: () => T): T => {
  const previous = process.env.DATA_SERVICE_COMPRESSION;
  process.env.DATA_SERVICE_COMPRESSION = "1";
  try {
    return start();
  } finally {
    if (previous === undefined) {
      delete process.env.DATA_SERVICE_COMPRESSION;
    } else {
      process.env.DATA_SERVICE_COMPRESSION = previous;
    }
  }
};

const refData = compressed(() => startRefData({ port: 0, log: quiet }));
const prices = compressed(() =>
  startPrices({
    log: quiet,
    port: 0,
    refDataUrl: refData.service.url,
    updatesPerSecond: 0,
  }),
);
afterAll(() => Promise.all([prices.service.stop(), refData.service.stop()]));

const subscribe = (tap: WireTap, resource: string) =>
  new WireClient(tap.url, { type: "subscribe", resource });

/** resolves once update rows stop arriving */
const settled = async (client: WireClient, quietMs = 100) => {
  await waitFor(() => client.updateRows > 0);
  let last = -1;
  while (client.updateRows !== last) {
    last = client.updateRows;
    await Bun.sleep(quietMs);
  }
};

describe("compressed data services perf", () => {
  test(
    "compressed reference data snapshot",
    async () => {
      await refData.loaded;
      let client!: WireClient;
      let tap!: WireTap;
      const ms = await sample(async () => {
        tap?.stop();
        tap = new WireTap(refData.service.port);
        client = subscribe(tap, "instruments");
        const snapshotMs = await client.snapshot;
        client.close();
        return snapshotMs;
      });
      tap.stop();
      expect(tap.deflate).toBe(true);
      expect(client.snapshotRows).toBe(refData.instruments.rowCount);
      record({
        better: "lower",
        description: "time to receive the compressed instruments snapshot",
        kind: "time",
        name: "compressed.refdata.snapshot.time",
        unit: "ms",
        value: ms,
      });
      record({
        better: "lower",
        description: "compressed instruments snapshot wire bytes per row",
        kind: "size",
        name: "compressed.refdata.snapshot.wireBytesPerRow",
        unit: "B",
        value: round(tap.bytes / client.snapshotRows),
      });
    },
    120_000,
  );

  test(
    "compressed prices snapshot and updates",
    async () => {
      await prices.refData.firstSnapshot;
      const tap = new WireTap(prices.service.port);
      const client = subscribe(tap, "prices");
      await client.snapshot;
      expect(tap.deflate).toBe(true);
      const snapshotBytes = tap.bytes;

      const { generator } = prices;
      const flushMs = await sample(async () => {
        generator.start(PRICE_UPDATES);
        generator.stop();
        generator.tick(performance.now() + 1000);
        const start = performance.now();
        prices.service.flush();
        const ms = performance.now() - start;
        await settled(client);
        return ms;
      });
      client.close();
      tap.stop();

      record({
        better: "lower",
        description: "compressed prices snapshot wire bytes per row",
        kind: "size",
        name: "compressed.prices.snapshot.wireBytesPerRow",
        unit: "B",
        value: round(snapshotBytes / client.snapshotRows),
      });
      record({
        better: "lower",
        description: `flush ${PRICE_UPDATES} price updates with compression`,
        kind: "time",
        name: "compressed.prices.flush.time",
        unit: "ms",
        value: flushMs,
      });
      record({
        better: "lower",
        description: "compressed live price update wire bytes per row",
        kind: "size",
        name: "compressed.prices.updates.wireBytesPerRow",
        unit: "B",
        value: round((tap.bytes - snapshotBytes) / client.updateRows),
      });
    },
    120_000,
  );
});
