import { afterAll, describe, expect, test } from "bun:test";
import { Table } from "@heswell/vuu-table";
import type { TableSchema } from "@vuu-ui/vuu-data-types";
import {
  DataService,
  RemoteTableSubscription,
  TablePublisher,
  type SubscriberSocket,
} from "../packages/service-utils/src/publisher";
import {
  createRecorder,
  elapsed,
  quiet,
  round,
  sample,
  WireClient,
} from "./harness";

/**
 * Publisher framework metrics, using synthetic, deterministic data so that
 * message counts and sizes are exactly reproducible.
 */

const record = createRecorder();

const SNAPSHOT_ROWS = 200_000;
const UPDATE_ROWS = 20_000;
const UPDATES_PER_ROW = 10;
const FANOUT_SUBSCRIBERS = 50;

const schema: TableSchema = {
  columns: [
    { name: "ric", serverDataType: "string" },
    { name: "ask", serverDataType: "double" },
    { name: "askSize", serverDataType: "int" },
    { name: "bid", serverDataType: "double" },
    { name: "bidSize", serverDataType: "int" },
    { name: "close", serverDataType: "double" },
    { name: "last", serverDataType: "double" },
    { name: "open", serverDataType: "double" },
    { name: "phase", serverDataType: "string" },
    { name: "scenario", serverDataType: "string" },
  ],
  key: "ric",
  table: { module: "PERF", table: "prices" },
};

const row = (i: number, version = 0) => [
  `RIC${i}.L`,
  100 + (i % 1000) / 100 + version / 1000,
  1000 + ((i * 7) % 90_000),
  99.5 + (i % 1000) / 100 + version / 1000,
  1000 + ((i * 13) % 90_000),
  0,
  100 + version / 100,
  0,
  "C",
  "fastTick",
];

const createTable = (rowCount: number) => {
  const table = new Table({ schema });
  for (let i = 0; i < rowCount; i++) {
    table.insert(row(i));
  }
  return table;
};

/** Updates every row `times` times. */
const updateAll = (table: Table, rowCount: number, times: number) => {
  for (let version = 1; version <= times; version++) {
    for (let i = 0; i < rowCount; i++) {
      table.upsert(row(i, version));
    }
  }
};

class FakeSocket implements SubscriberSocket {
  messages: string[] = [];
  getBufferedAmount() {
    return 0;
  }
  send(data: string) {
    this.messages.push(data);
    return data.length;
  }
}

const services: DataService[] = [];
afterAll(() => Promise.all(services.map((service) => service.stop())));

const startService = (table: Table) => {
  // flush is driven explicitly by the tests
  const service = new DataService({
    flushInterval: 3_600_000,
    log: quiet,
    name: "PERF",
    port: 0,
  })
    .addPublisher(new TablePublisher({ table }))
    .start();
  services.push(service);
  return service;
};

describe("publisher perf", () => {
  test(
    `snapshot ${SNAPSHOT_ROWS} rows over websocket`,
    async () => {
      const service = startService(createTable(SNAPSHOT_ROWS));
      let client!: WireClient;

      const ms = await sample(async () => {
        client = new WireClient(service.url, {
          type: "subscribe",
          resource: "prices",
        });
        const snapshotMs = await client.snapshot;
        client.close();
        return snapshotMs;
      });

      expect(client.snapshotRows).toBe(SNAPSHOT_ROWS);
      record({
        better: "lower",
        description: `time to receive a ${SNAPSHOT_ROWS} row snapshot`,
        kind: "time",
        name: "publisher.snapshot.time",
        unit: "ms",
        value: ms,
      });
      record({
        better: "lower",
        description: "websocket messages for the snapshot",
        kind: "count",
        name: "publisher.snapshot.messages",
        unit: "msgs",
        value: client.snapshotMessages,
      });
      record({
        better: "lower",
        description: "snapshot bytes per row",
        kind: "size",
        name: "publisher.snapshot.bytesPerRow",
        unit: "B",
        value: round(client.snapshotBytes / SNAPSHOT_ROWS),
      });
    },
    60_000,
  );

  test(
    `replicate ${SNAPSHOT_ROWS} rows with RemoteTableSubscription`,
    async () => {
      const service = startService(createTable(SNAPSHOT_ROWS));
      let replica!: Table;

      const ms = await sample(async () => {
        replica = new Table({ schema });
        const subscription = new RemoteTableSubscription({
          log: quiet,
          resource: "prices",
          table: replica,
          url: service.url,
        });
        const replicateMs = await elapsed(() =>
          subscription.start().firstSnapshot,
        );
        subscription.stop();
        return replicateMs;
      });

      expect(replica.rowCount).toBe(SNAPSHOT_ROWS);
      record({
        better: "lower",
        description: `time to replicate ${SNAPSHOT_ROWS} rows into a local table`,
        kind: "time",
        name: "subscription.replicate.time",
        unit: "ms",
        value: ms,
      });
    },
    60_000,
  );

  test(
    `conflates ${UPDATES_PER_ROW} updates per row across ${UPDATE_ROWS} rows`,
    async () => {
      const table = createTable(UPDATE_ROWS);
      const service = startService(table);
      const client = new WireClient(service.url, {
        type: "subscribe",
        resource: "prices",
      });
      await client.snapshot;

      const updates = UPDATE_ROWS * UPDATES_PER_ROW;
      const ingestMs = await elapsed(() =>
        updateAll(table, UPDATE_ROWS, UPDATES_PER_ROW),
      );
      const flushMs = await elapsed(() => service.flush());
      await client.waitForUpdateRows(UPDATE_ROWS);
      client.close();

      record({
        better: "lower",
        description: "table mutation cost with a live subscriber",
        kind: "time",
        name: "publisher.ingest.timePer100k",
        unit: "ms",
        value: round((ingestMs * 100_000) / updates),
      });
      record({
        better: "lower",
        description: `flush (serialize + send) after ${updates} updates`,
        kind: "time",
        name: "publisher.flush.time",
        unit: "ms",
        value: round(flushMs),
      });
      record({
        better: "lower",
        description: `rows sent for ${updates} updates to ${UPDATE_ROWS} rows`,
        kind: "count",
        name: "publisher.updates.rowsSent",
        unit: "rows",
        value: client.updateRows,
      });
      record({
        better: "lower",
        description: "live update bytes per row",
        kind: "size",
        name: "publisher.updates.bytesPerRow",
        unit: "B",
        value: round(client.updateBytes / client.updateRows),
      });
    },
    60_000,
  );

  test(`fan out updates to ${FANOUT_SUBSCRIBERS} subscribers`, () => {
    const table = createTable(UPDATE_ROWS);
    const publisher = new TablePublisher({ table });
    const sockets = Array.from(
      { length: FANOUT_SUBSCRIBERS },
      () => new FakeSocket(),
    );
    sockets.forEach((socket) => publisher.subscribe(socket));
    sockets.forEach((socket) => (socket.messages.length = 0));

    updateAll(table, UPDATE_ROWS, 1);
    const ms = round(elapsedSync(() => publisher.flush()));

    const sent = sockets.flatMap((socket) => socket.messages);
    expect(sent.length).toBeGreaterThan(0);
    record({
      better: "lower",
      description: `flush ${UPDATE_ROWS} updated rows to ${FANOUT_SUBSCRIBERS} subscribers`,
      kind: "time",
      name: "publisher.fanout.flushTime",
      unit: "ms",
      value: ms,
    });
    record({
      better: "lower",
      description: "distinct messages serialized for the fan out",
      kind: "count",
      name: "publisher.fanout.serializations",
      unit: "msgs",
      value: new Set(sent).size,
    });
    publisher.dispose();
  });

  test("updates published with no subscribers are not queued", () => {
    const table = createTable(UPDATE_ROWS);
    const publisher = new TablePublisher({ table });

    const ingestMs = elapsedSync(() => updateAll(table, UPDATE_ROWS, 5));
    publisher.flush();

    const socket = new FakeSocket();
    publisher.subscribe(socket);
    publisher.flush();
    const backlogRows = socket.messages
      .map((message) => JSON.parse(message))
      .filter((message) => message.type === "updates")
      .reduce((count, message) => count + message.rows.length, 0);

    record({
      better: "lower",
      description: "table mutation cost with no subscribers",
      kind: "time",
      name: "publisher.idle.ingestTimePer100k",
      unit: "ms",
      value: round(ingestMs),
    });
    record({
      better: "lower",
      description: "update rows replayed to a late subscriber",
      kind: "count",
      name: "publisher.idle.backlogRows",
      unit: "rows",
      value: backlogRows,
    });
    publisher.dispose();
  });
});

const elapsedSync = (fn: () => void) => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};
