import { afterEach, describe, expect, test } from "bun:test";
import { Table } from "@heswell/vuu-table";
import type { TableSchema } from "@vuu-ui/vuu-data-types";
import {
  DataService,
  RateGenerator,
  RemoteTableSubscription,
  TablePublisher,
} from "../src/publisher";
import { TestRemoteResourceSocket } from "./TestRemoteResourceSocket";

const schema: TableSchema = {
  columns: [
    { name: "ric", serverDataType: "string" },
    { name: "price", serverDataType: "double" },
  ],
  key: "ric",
  table: { module: "TEST", table: "prices" },
};

const quiet = () => undefined;
const fastReconnect = { initialDelay: 5, maxDelay: 20 };

const waitFor = async (predicate: () => boolean, timeout = 2000) => {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > timeout) {
      throw Error("timed out waiting for condition");
    }
    await Bun.sleep(5);
  }
};

describe("RemoteTableSubscription", () => {
  const createSubscription = (
    sockets: TestRemoteResourceSocket[],
    options: Partial<ConstructorParameters<typeof RemoteTableSubscription>[0]> = {},
  ) =>
    new RemoteTableSubscription({
      log: quiet,
      reconnect: fastReconnect,
      resource: "prices",
      socketFactory: () => {
        const socket = new TestRemoteResourceSocket();
        sockets.push(socket);
        return socket;
      },
      table: new Table({ schema }),
      url: "ws://test",
      ...options,
    });

  test("requests key column and validates it", () => {
    expect(
      () =>
        new RemoteTableSubscription({
          columns: ["price"],
          resource: "prices",
          table: new Table({ schema }),
          url: "ws://test",
        }),
    ).toThrow("must include key column 'ric'");
  });

  test("applies snapshot then live updates and deletes", async () => {
    const sockets: TestRemoteResourceSocket[] = [];
    const sub = createSubscription(sockets).start();
    const [socket] = sockets;
    socket.emitOpen();
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: "subscribe",
      resource: "prices",
      columns: ["ric", "price"],
    });
    socket.emitMessage({
      type: "snapshot-batch",
      isLast: true,
      rows: [
        ["A", 1],
        ["B", 2],
      ],
    });
    expect(sub.status).toBe("snapshot");
    socket.emitMessage({ type: "snapshot-count", count: 2 });
    expect(await sub.firstSnapshot).toBe(2);
    expect(sub.status).toBe("live");

    socket.emitMessage({ type: "updates", rows: [["A", 10], ["C", 3]] });
    socket.emitMessage({ type: "deletes", keys: ["B"] });
    // legacy single row message
    socket.emitMessage({ type: "update", row: ["C", 30] });
    expect(sub.table.rows).toEqual([
      ["A", 10],
      ["C", 30],
    ]);
    sub.stop();
  });

  test("replies to heartbeats", () => {
    const sockets: TestRemoteResourceSocket[] = [];
    const sub = createSubscription(sockets).start();
    sockets[0].emitOpen();
    sockets[0].emitMessage({ type: "HB", ts: 42 });
    expect(JSON.parse(sockets[0].sent[1])).toEqual({ type: "HB", ts: 42 });
    sub.stop();
  });

  test("retries until the remote service is available", async () => {
    const sockets: TestRemoteResourceSocket[] = [];
    const sub = createSubscription(sockets).start();
    sockets[0].emitError();
    sockets[0].emitClose();
    expect(sub.status).toBe("disconnected");
    await waitFor(() => sockets.length === 2);
    sockets[1].emitClose();
    await waitFor(() => sockets.length === 3);
    sockets[2].emitOpen();
    sockets[2].emitMessage({ type: "snapshot-batch", isLast: true, rows: [["A", 1]] });
    sockets[2].emitMessage({ type: "snapshot-count", count: 1 });
    expect(await sub.firstSnapshot).toBe(1);
    expect(sub.health.reconnects).toBe(2);
    sub.stop();
  });

  test("reconciles table against snapshot after reconnect, keeping stale data while disconnected", async () => {
    const sockets: TestRemoteResourceSocket[] = [];
    const snapshots: Array<[number, boolean]> = [];
    const sub = createSubscription(sockets).start();
    sub.onSnapshot((count, isFirst) => snapshots.push([count, isFirst]));
    sockets[0].emitOpen();
    sockets[0].emitMessage({
      type: "snapshot-batch",
      isLast: true,
      rows: [
        ["A", 1],
        ["B", 2],
        ["C", 3],
      ],
    });
    sockets[0].emitMessage({ type: "snapshot-count", count: 3 });

    sockets[0].emitClose();
    expect(sub.table.rowCount).toBe(3);
    await waitFor(() => sockets.length === 2);

    sockets[1].emitOpen();
    sockets[1].emitMessage({
      type: "snapshot-batch",
      isLast: true,
      rows: [
        ["C", 33],
        ["D", 4],
      ],
    });
    sockets[1].emitMessage({ type: "snapshot-count", count: 2 });
    expect(sub.table.rows.slice().sort()).toEqual([
      ["C", 33],
      ["D", 4],
    ]);
    expect(snapshots).toEqual([
      [3, true],
      [2, false],
    ]);
    sub.stop();
  });

  test("snapshot mode closes after snapshot and does not reconnect", async () => {
    const sockets: TestRemoteResourceSocket[] = [];
    const sub = createSubscription(sockets, { mode: "snapshot" }).start();
    sockets[0].emitOpen();
    expect(JSON.parse(sockets[0].sent[0]).type).toBe("snapshot");
    sockets[0].emitMessage({ type: "snapshot-count", count: 0 });
    expect(sub.status).toBe("complete");
    expect(sockets[0].closeCount).toBe(1);
    expect(sockets[0].listenerCount).toBe(0);
    await Bun.sleep(30);
    expect(sockets.length).toBe(1);
  });

  test("stop cancels reconnection and rejects firstSnapshot", async () => {
    const sockets: TestRemoteResourceSocket[] = [];
    const sub = createSubscription(sockets).start();
    sockets[0].emitClose();
    sub.stop();
    await expect(sub.firstSnapshot).rejects.toThrow("stopped before snapshot");
    await Bun.sleep(30);
    expect(sockets.length).toBe(1);
    expect(sub.status).toBe("stopped");
  });

  test("a remote error message triggers reconnect", async () => {
    const sockets: TestRemoteResourceSocket[] = [];
    const sub = createSubscription(sockets).start();
    sockets[0].emitOpen();
    sockets[0].emitMessage({ type: "error", message: "unknown resource" });
    expect(sockets[0].closeCount).toBe(1);
    await waitFor(() => sockets.length === 2);
    sub.stop();
  });
});

class TestGenerator extends RateGenerator {
  counts: number[] = [];
  protected generate(count: number) {
    this.counts.push(count);
  }
}

describe("RateGenerator", () => {
  test("generates at the configured rate, carrying fractions", () => {
    let now = 0;
    const generator = new TestGenerator({
      name: "test",
      now: () => now,
      ratePerSecond: 30,
    });
    generator.start();
    for (let i = 0; i < 20; i++) {
      now += 50;
      generator.tick(now);
    }
    generator.stop();
    // 30/s for 1 second
    expect(generator.counts.reduce((a, b) => a + b, 0)).toBe(30);
    expect(generator.status.generated).toBe(30);
  });

  test("caps catch-up after a stall to one second", () => {
    let now = 0;
    const generator = new TestGenerator({
      name: "test",
      now: () => now,
      ratePerSecond: 100,
    });
    generator.start();
    now = 10_000;
    generator.tick(now);
    generator.stop();
    expect(generator.counts).toEqual([100]);
  });

  test("validates rate", () => {
    const generator = new TestGenerator({ name: "test", maxRatePerSecond: 10 });
    expect(() => generator.start(11)).toThrow("rate must be between 0 and 10");
    expect(() => generator.start(Number.NaN)).toThrow();
    expect(generator.running).toBe(false);
  });

  test("runs on its own timer", async () => {
    const generator = new TestGenerator({ name: "test", tickInterval: 10 });
    generator.start(1000);
    await Bun.sleep(100);
    generator.stop();
    expect(generator.status.generated).toBeGreaterThan(30);
  });
});

describe("DataService integration", () => {
  const services: DataService[] = [];
  const subscriptions: RemoteTableSubscription[] = [];
  afterEach(async () => {
    subscriptions.splice(0).forEach((s) => s.stop());
    await Promise.all(services.splice(0).map((s) => s.stop()));
  });

  const freePort = () => {
    const server = Bun.serve({ port: 0, fetch: () => new Response() });
    const { port } = server;
    server.stop(true);
    return port;
  };

  const createService = (port: number, table = new Table({ schema })) => {
    const service = new DataService({
      flushInterval: 10,
      log: quiet,
      name: "TEST",
      port,
    }).addPublisher(new TablePublisher({ table }));
    services.push(service);
    return { service, table };
  };

  test("client started before the service connects when it comes up, and recovers after a restart", async () => {
    const port = freePort();
    const replica = new Table({ schema });
    const sub = new RemoteTableSubscription({
      log: quiet,
      reconnect: fastReconnect,
      resource: "prices",
      table: replica,
      url: `ws://localhost:${port}`,
    }).start();
    subscriptions.push(sub);

    await Bun.sleep(30);
    expect(sub.status).toBe("disconnected");

    const { service, table } = createService(port);
    table.insert(["A", 1]);
    table.insert(["B", 2]);
    service.start();

    await sub.firstSnapshot;
    expect(replica.rows).toEqual([
      ["A", 1],
      ["B", 2],
    ]);

    table.upsert(["A", 11]);
    table.insert(["C", 3]);
    table.delete("B");
    await waitFor(() => replica.rowCount === 2 && replica.hasKey("C"));
    expect(replica.getRowAtKey("A")).toEqual(["A", 11]);

    // restart upstream with different data
    await service.stop();
    services.length = 0;
    await waitFor(() => sub.status === "disconnected");
    expect(replica.rowCount).toBe(2);

    const { service: service2, table: table2 } = createService(port);
    table2.insert(["Z", 26]);
    service2.start();
    await waitFor(() => sub.health.snapshots === 2);
    expect(replica.rows).toEqual([["Z", 26]]);
  });

  test("subscriptions wait for publisher readiness, unknown resource gets error", async () => {
    const port = freePort();
    const table = new Table({ schema });
    const publisher = new TablePublisher({ table, ready: false });
    const service = new DataService({
      flushInterval: 10,
      log: quiet,
      name: "TEST",
      port,
    }).addPublisher(publisher);
    services.push(service);
    service.start();

    const replica = new Table({ schema });
    const sub = new RemoteTableSubscription({
      log: quiet,
      reconnect: fastReconnect,
      resource: "prices",
      table: replica,
      url: service.url,
    }).start();
    subscriptions.push(sub);
    await waitFor(() => publisher.subscriberCount === 1);
    table.insert(["A", 1]);
    await Bun.sleep(30);
    expect(sub.hasSnapshot).toBe(false);
    publisher.setReady();
    expect(await sub.firstSnapshot).toBe(1);

    const ws = new WebSocket(service.url);
    const message = await new Promise<any>((resolve) => {
      ws.onopen = () =>
        ws.send(JSON.stringify({ type: "subscribe", resource: "nope" }));
      ws.onmessage = (evt) => resolve(JSON.parse(evt.data as string));
    });
    ws.close();
    expect(message).toEqual({
      type: "error",
      resource: "nope",
      message: "unknown resource 'nope'",
    });
  });

  test("admin routes control generators, health reports status", async () => {
    const table = new Table({ schema });
    class PriceGen extends TestGenerator {}
    const generator = new PriceGen({
      name: "prices",
      rateParam: "updatesPerSecond",
    });
    const { service } = createService(0, table);
    service.addGenerator(generator).start();
    const base = `http://localhost:${service.port}`;

    let response = await fetch(`${base}/admin/start?updatesPerSecond=20`);
    expect(await response.json()).toMatchObject({
      name: "prices",
      ratePerSecond: 20,
      running: true,
    });
    response = await fetch(`${base}/admin/start?rate=999999`);
    expect(response.status).toBe(400);
    response = await fetch(`${base}/admin/stop`);
    expect((await response.json()).running).toBe(false);

    response = await fetch(`${base}/health`);
    const health = await response.json();
    expect(health.publishers).toEqual([
      { ready: true, resource: "prices", rows: 0, subscribers: 0 },
    ]);
    expect(health.generators[0].name).toBe("prices");
  });
});
