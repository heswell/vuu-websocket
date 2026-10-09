import { afterAll, describe, expect, test } from "bun:test";
import type { DataService } from "../packages/service-utils/src/publisher";
import { start as startOrders } from "../packages/orders-service/src/server";
import { start as startPrices } from "../packages/price-service/src/server";
import { start as startRefData } from "../packages/reference-data-service/src/server";
import {
  createRecorder,
  elapsed,
  quiet,
  round,
  sample,
  waitFor,
  WireClient,
} from "./harness";

/**
 * End to end metrics for the demo data services, using the real
 * instruments data set (packages/reference-data-service/data).
 */

const record = createRecorder();

const GENERATED_PRICE_UPDATES = 100_000;
const INITIAL_ORDERS = 10_000;

const services: DataService[] = [];
afterAll(() => Promise.all(services.map((service) => service.stop())));

let refData: ReturnType<typeof startRefData>;

const subscribe = (service: DataService, resource: string) =>
  new WireClient(service.url, { type: "subscribe", resource });

/** resolves once no further update rows arrive for `quietMs` */
const settled = async (client: WireClient, quietMs = 100) => {
  await waitFor(() => client.updateRows > 0);
  let last = -1;
  while (client.updateRows !== last) {
    last = client.updateRows;
    await Bun.sleep(quietMs);
  }
};

describe("data services perf", () => {
  test(
    "reference data loads instruments",
    async () => {
      const ms = await sample(async () => {
        refData?.service.stop();
        refData = startRefData({ port: 0, log: quiet });
        return elapsed(() => refData.loaded);
      });
      services.push(refData.service);
      expect(refData.instruments.rowCount).toBeGreaterThan(0);
      record({
        better: "lower",
        description: `load ${refData.instruments.rowCount} instruments from ndjson`,
        kind: "time",
        name: "refdata.load.time",
        unit: "ms",
        value: ms,
      });
    },
    120_000,
  );

  test(
    "reference data snapshot",
    async () => {
      let client!: WireClient;
      const ms = await sample(async () => {
        client = subscribe(refData.service, "instruments");
        const snapshotMs = await client.snapshot;
        client.close();
        return snapshotMs;
      });
      expect(client.snapshotRows).toBe(refData.instruments.rowCount);
      record({
        better: "lower",
        description: "time to receive the instruments snapshot",
        kind: "time",
        name: "refdata.snapshot.time",
        unit: "ms",
        value: ms,
      });
      record({
        better: "lower",
        description: "websocket messages for the instruments snapshot",
        kind: "count",
        name: "refdata.snapshot.messages",
        unit: "msgs",
        value: client.snapshotMessages,
      });
      record({
        better: "lower",
        description: "instruments snapshot bytes per row",
        kind: "size",
        name: "refdata.snapshot.bytesPerRow",
        unit: "B",
        value: round(client.snapshotBytes / client.snapshotRows),
      });
    },
    120_000,
  );

  test(
    "price service startup, snapshot and generated updates",
    async () => {
      let prices!: ReturnType<typeof startPrices>;
      let client!: WireClient;
      // from service start: replicate instruments, create prices, send snapshot
      const ms = await sample(async () => {
        prices?.service.stop();
        prices = startPrices({
          log: quiet,
          port: 0,
          refDataUrl: refData.service.url,
          updatesPerSecond: 0,
        });
        client?.close();
        client = subscribe(prices.service, "prices");
        return client.snapshot;
      });
      services.push(prices.service);
      expect(client.snapshotRows).toBe(refData.instruments.rowCount);

      const { generator } = prices;
      generator.start(GENERATED_PRICE_UPDATES);
      generator.stop();
      const generateMs = await elapsed(() =>
        generator.tick(performance.now() + 1000),
      );
      expect(generator.status.generated).toBe(GENERATED_PRICE_UPDATES);
      const flushMs = await elapsed(() => prices.service.flush());
      await settled(client);
      client.close();

      record({
        better: "lower",
        description:
          "price service start to subscriber holding the full prices snapshot",
        kind: "time",
        name: "prices.startToSnapshot.time",
        unit: "ms",
        value: ms,
      });
      record({
        better: "lower",
        description: "prices snapshot bytes per row",
        kind: "size",
        name: "prices.snapshot.bytesPerRow",
        unit: "B",
        value: round(client.snapshotBytes / client.snapshotRows),
      });
      record({
        better: "lower",
        description: `generate ${GENERATED_PRICE_UPDATES} price updates`,
        kind: "time",
        name: "prices.generate.time",
        unit: "ms",
        value: round(generateMs),
      });
      record({
        better: "lower",
        description: `flush after ${GENERATED_PRICE_UPDATES} price updates`,
        kind: "time",
        name: "prices.flush.time",
        unit: "ms",
        value: round(flushMs),
      });
      record({
        better: "lower",
        description: "live price update bytes per row",
        kind: "size",
        name: "prices.updates.bytesPerRow",
        unit: "B",
        value: round(client.updateBytes / client.updateRows),
      });
    },
    120_000,
  );

  test(
    "orders service startup and order creation",
    async () => {
      let orders!: ReturnType<typeof startOrders>;
      let client!: WireClient;
      const ms = await sample(async () => {
        orders?.service.stop();
        orders = startOrders({
          initialOrderCount: INITIAL_ORDERS,
          log: quiet,
          newOrdersPerSecond: 0,
          port: 0,
          refDataUrl: refData.service.url,
        });
        client?.close();
        client = subscribe(orders.service, "parentOrders");
        return client.snapshot;
      });
      services.push(orders.service);
      client.close();
      expect(client.snapshotRows).toBe(INITIAL_ORDERS);

      const createMs = await elapsed(() =>
        orders.generator.createInitialOrders(INITIAL_ORDERS),
      );

      record({
        better: "lower",
        description: `orders service start to subscriber holding ${INITIAL_ORDERS} orders`,
        kind: "time",
        name: "orders.startToSnapshot.time",
        unit: "ms",
        value: ms,
      });
      record({
        better: "lower",
        description: "orders snapshot bytes per row",
        kind: "size",
        name: "orders.snapshot.bytesPerRow",
        unit: "B",
        value: round(client.snapshotBytes / client.snapshotRows),
      });
      record({
        better: "lower",
        description: `create ${INITIAL_ORDERS} orders`,
        kind: "time",
        name: "orders.create.time",
        unit: "ms",
        value: round(createMs),
      });
    },
    120_000,
  );
});
