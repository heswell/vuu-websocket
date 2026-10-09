import { describe, expect, test } from "bun:test";
import { Table } from "@heswell/vuu-table";
import type { TableSchema } from "@vuu-ui/vuu-data-types";
import { TablePublisher, type SubscriberSocket } from "../src/publisher";

const schema: TableSchema = {
  columns: [
    { name: "id", serverDataType: "string" },
    { name: "price", serverDataType: "double" },
    { name: "size", serverDataType: "int" },
  ],
  key: "id",
  table: { module: "TEST", table: "prices" },
};

class FakeSocket implements SubscriberSocket {
  bufferedAmount = 0;
  compressFlags: (boolean | undefined)[] = [];
  messages: any[] = [];
  serializations = new Set<string>();
  getBufferedAmount() {
    return this.bufferedAmount;
  }
  send(data: string, compress?: boolean) {
    this.compressFlags.push(compress);
    this.serializations.add(data);
    this.messages.push(JSON.parse(data));
    return data.length;
  }
  take() {
    return this.messages.splice(0);
  }
  ofType(type: string) {
    return this.messages.filter((m) => m.type === type);
  }
}

const createTable = (rowCount = 3) => {
  const table = new Table({ schema });
  for (let i = 0; i < rowCount; i++) {
    table.insert([`id-${i}`, 100 + i, 10 * i]);
  }
  return table;
};

describe("TablePublisher", () => {
  test("snapshot is batched and terminated with snapshot-count", () => {
    const table = createTable(5);
    const publisher = new TablePublisher({ table, snapshotBatchSize: 2 });
    const socket = new FakeSocket();
    publisher.subscribe(socket);
    const messages = socket.take();
    expect(messages.map((m) => m.type)).toEqual([
      "snapshot-batch",
      "snapshot-batch",
      "snapshot-batch",
      "snapshot-count",
    ]);
    expect(messages.map((m) => m.isLast)).toEqual([
      false,
      false,
      true,
      undefined,
    ]);
    expect(messages.slice(0, 3).flatMap((m) => m.rows)).toEqual(table.rows);
    expect(messages[3]).toEqual({
      type: "snapshot-count",
      resource: "prices",
      count: 5,
    });
  });

  test("updates are conflated by key between flushes", () => {
    const table = createTable();
    const publisher = new TablePublisher({ table });
    const socket = new FakeSocket();
    publisher.subscribe(socket);
    socket.take();

    for (let i = 0; i < 100; i++) {
      table.upsert(["id-1", 200 + i, 1]);
    }
    table.upsert(["id-2", 300, 2]);
    expect(publisher.flush()).toBe(2);
    expect(socket.take()).toEqual([
      {
        type: "updates",
        resource: "prices",
        rows: [
          ["id-1", 299, 1],
          ["id-2", 300, 2],
        ],
      },
    ]);
    expect(publisher.flush()).toBe(0);
    expect(socket.take()).toEqual([]);
  });

  test("inserts are published as updates, deletes as keys", () => {
    const table = createTable();
    const publisher = new TablePublisher({ table });
    const socket = new FakeSocket();
    publisher.subscribe(socket);
    socket.take();

    table.insert(["id-9", 1, 1]);
    table.upsert(["id-0", 2, 2]);
    table.delete("id-0");
    table.delete("id-1");
    publisher.flush();
    expect(socket.take()).toEqual([
      { type: "updates", resource: "prices", rows: [["id-9", 1, 1]] },
      { type: "deletes", resource: "prices", keys: ["id-0", "id-1"] },
    ]);
  });

  test("a row deleted then re-inserted is published as an update", () => {
    const table = createTable();
    const publisher = new TablePublisher({ table });
    const socket = new FakeSocket();
    publisher.subscribe(socket);
    socket.take();

    table.delete("id-0");
    table.insert(["id-0", 5, 5]);
    publisher.flush();
    expect(socket.take()).toEqual([
      { type: "updates", resource: "prices", rows: [["id-0", 5, 5]] },
    ]);
  });

  test("subscribers sharing a projection share one serialized message", () => {
    const table = createTable();
    const publisher = new TablePublisher({ table });
    const a = new FakeSocket();
    const b = new FakeSocket();
    const c = new FakeSocket();
    publisher.subscribe(a, { columns: ["price", "id"] });
    publisher.subscribe(b, { columns: ["price", "id"] });
    publisher.subscribe(c);
    expect(a.take()[0].rows[0]).toEqual([100, "id-0"]);
    b.take();
    c.take();

    table.upsert(["id-1", 7, 7]);
    publisher.flush();
    const [updateA] = a.take();
    const [updateB] = b.take();
    const [updateC] = c.take();
    expect(updateA.rows).toEqual([[7, "id-1"]]);
    expect(updateB).toEqual(updateA);
    expect(updateC.rows).toEqual([["id-1", 7, 7]]);
    // exact same string instance content delivered to both projection members
    const lastA = Array.from(a.serializations).at(-1);
    const lastB = Array.from(b.serializations).at(-1);
    expect(lastA).toBe(lastB);
  });

  test("unknown columns are rejected", () => {
    const publisher = new TablePublisher({ table: createTable() });
    expect(() =>
      publisher.subscribe(new FakeSocket(), { columns: ["id", "nope"] }),
    ).toThrow("has no column 'nope'");
    expect(publisher.subscriberCount).toBe(0);
  });

  test("snapshot pauses on backpressure, updates are deferred until it completes", () => {
    const table = createTable(5);
    const publisher = new TablePublisher({
      highWaterMark: 100,
      snapshotBatchSize: 2,
      table,
    });
    const socket = new FakeSocket();
    socket.bufferedAmount = 1000;
    publisher.subscribe(socket);
    expect(socket.take().map((m) => m.type)).toEqual(["snapshot-batch"]);

    // update to a row already sent and to one not yet sent
    table.upsert(["id-0", 1, 1]);
    table.upsert(["id-4", 4, 4]);
    publisher.flush();
    expect(socket.take()).toEqual([]);

    socket.bufferedAmount = 0;
    publisher.onDrain(socket);
    const messages = socket.take();
    expect(messages.map((m) => m.type)).toEqual([
      "snapshot-batch",
      "snapshot-batch",
      "snapshot-count",
      "updates",
    ]);
    // snapshot is point in time, the update follows it
    expect(messages[1].rows).toEqual([["id-4", 104, 40]]);
    expect(messages[3].rows).toEqual([
      ["id-0", 1, 1],
      ["id-4", 4, 4],
    ]);
  });

  test("subscribers wait until publisher is ready", () => {
    const table = new Table({ schema });
    const publisher = new TablePublisher({ table, ready: false });
    const socket = new FakeSocket();
    publisher.subscribe(socket);
    table.insert(["id-0", 1, 1]);
    publisher.flush();
    expect(socket.take()).toEqual([]);

    publisher.setReady();
    expect(socket.take()).toEqual([
      {
        type: "snapshot-batch",
        resource: "prices",
        isLast: true,
        rows: [["id-0", 1, 1]],
      },
      { type: "snapshot-count", resource: "prices", count: 1 },
    ]);
    publisher.flush();
    expect(socket.take()).toEqual([]);
  });

  test("snapshot mode subscribers are removed after the snapshot", () => {
    const table = createTable();
    const publisher = new TablePublisher({ table });
    const socket = new FakeSocket();
    publisher.subscribe(socket, { mode: "snapshot" });
    expect(socket.take().at(-1).type).toBe("snapshot-count");
    expect(publisher.isSubscribed(socket)).toBe(false);
    table.upsert(["id-0", 1, 1]);
    publisher.flush();
    expect(socket.take()).toEqual([]);
  });

  test("changes are not tracked without subscribers", () => {
    const table = createTable();
    const publisher = new TablePublisher({ table });
    table.upsert(["id-0", 1, 1]);
    const socket = new FakeSocket();
    publisher.subscribe(socket);
    socket.take();
    expect(publisher.flush()).toBe(0);
  });

  test("clear triggers a fresh snapshot", () => {
    const table = createTable();
    const publisher = new TablePublisher({ table });
    const socket = new FakeSocket();
    publisher.subscribe(socket);
    socket.take();
    table.clear();
    table.insert(["id-x", 1, 1]);
    publisher.flush();
    const messages = socket.take();
    expect(messages.map((m) => m.type)).toEqual([
      "snapshot-batch",
      "snapshot-count",
    ]);
    expect(messages[0].rows).toEqual([["id-x", 1, 1]]);
  });

  test("large updates are chunked", () => {
    const table = createTable(10);
    const publisher = new TablePublisher({ table, maxRowsPerUpdate: 4 });
    const socket = new FakeSocket();
    publisher.subscribe(socket);
    socket.take();
    for (const row of table.rows.slice()) {
      table.upsert([row[0], 0, 0]);
    }
    publisher.flush();
    expect(socket.take().map((m) => m.rows.length)).toEqual([4, 4, 2]);
  });

  test("dispose detaches from the table", () => {
    const table = createTable();
    const before = table.listenerCount;
    const publisher = new TablePublisher({ table });
    expect(table.listenerCount).toBe(before + 1);
    publisher.dispose();
    expect(table.listenerCount).toBe(before);
  });

  test("compress option is passed on every send", () => {
    const table = createTable();
    const publisher = new TablePublisher({ table });
    const plain = new FakeSocket();
    const compressed = new FakeSocket();
    publisher.subscribe(plain);
    publisher.subscribe(compressed, { compress: true });
    table.upsert(["id-1", 1, 1]);
    publisher.flush();
    expect(plain.compressFlags.length).toBeGreaterThan(1);
    expect(plain.compressFlags.every((flag) => flag === false)).toBe(true);
    expect(compressed.compressFlags.length).toBe(plain.compressFlags.length);
    expect(compressed.compressFlags.every((flag) => flag === true)).toBe(true);
  });
});
