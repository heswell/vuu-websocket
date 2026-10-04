import { describe, expect, test } from "bun:test";
import { Table } from "@heswell/vuu-table";
import { TableSchema } from "@vuu-ui/vuu-data-types";
import {
  createRowMapper,
  loadTableFromRemoteResource,
  RemoteResourceSocket,
} from "../src/resource-loader";

const schema: TableSchema = {
  columns: [{ name: "id", serverDataType: "string" }],
  key: "id",
  table: { module: "TEST", table: "resource" },
};

describe("loadTableFromRemoteResource readiness", () => {
  test("rejects and cleans up on a connection error", async () => {
    const socket = new TestRemoteResourceSocket();
    const load = loadTableFromRemoteResource({
      resource: "resource",
      socketFactory: () => socket,
      table: new Table({ schema }),
      url: "ws://test",
    });

    socket.emitError();

    await expect(load).rejects.toThrow("connection error resource");
    expect(socket.closeCount).toBe(1);
    expect(socket.listenerCount).toBe(0);
  });

  test("rejects and cleans up when the connection closes before its snapshot", async () => {
    const socket = new TestRemoteResourceSocket();
    const load = loadTableFromRemoteResource({
      resource: "resource",
      socketFactory: () => socket,
      table: new Table({ schema }),
      url: "ws://test",
    });

    socket.emitClose();

    await expect(load).rejects.toThrow(
      "connection closed before initial snapshot resource",
    );
    expect(socket.closeCount).toBe(0);
    expect(socket.listenerCount).toBe(0);
  });
});

describe("loadTableFromRemoteResource column mapping", () => {
  const instrumentSchema: TableSchema = {
    columns: [
      { name: "exchange", serverDataType: "string" },
      { name: "ric", serverDataType: "string" },
      { name: "lotSize", serverDataType: "int" },
    ],
    key: "ric",
    table: { module: "TEST", table: "instruments" },
  };

  test("requests table columns when provider does not specify columns", async () => {
    const socket = new TestRemoteResourceSocket();
    const table = new Table({ schema: instrumentSchema });
    const load = loadTableFromRemoteResource({
      resource: "instruments",
      socketFactory: () => socket,
      table,
      url: "ws://test",
    });
    socket.emitOpen();
    expect(JSON.parse(socket.sent[0]).columns).toEqual([
      "exchange",
      "ric",
      "lotSize",
    ]);
    socket.emitMessage({
      type: "snapshot-batch",
      rows: [["XLON", "VOD.L", 100]],
    });
    socket.emitMessage({ type: "snapshot-count", count: 1 });
    await load;
    expect(table.rows).toEqual([["XLON", "VOD.L", 100]]);
  });

  test("maps rows by column name when requested columns differ from table", async () => {
    const socket = new TestRemoteResourceSocket();
    const table = new Table({ schema: instrumentSchema });
    const load = loadTableFromRemoteResource({
      columns: ["bbg", "ric", "currency", "exchange", "lotSize"],
      resource: "instruments",
      socketFactory: () => socket,
      table,
      url: "ws://test",
    });
    socket.emitOpen();
    socket.emitMessage({
      type: "snapshot-batch",
      rows: [
        ["VOD LN", "VOD.L", "GBP", "XLON", 100],
        ["BARC LN", "BARC.L", "GBP", "XLON", 200],
      ],
    });
    socket.emitMessage({ type: "snapshot-count", count: 2 });
    await load;
    expect(table.rows).toEqual([
      ["XLON", "VOD.L", 100],
      ["XLON", "BARC.L", 200],
    ]);
    expect(table.rowIndexAtKey("BARC.L")).toBe(1);
  });

  test("createRowMapper is a no-op when column order matches", () => {
    expect(createRowMapper(["a", "b"], ["a", "b"])).toBeUndefined();
    expect(createRowMapper(["b", "a"], ["a", "b"])?.([2, 1])).toEqual([1, 2]);
  });
});

class TestRemoteResourceSocket implements RemoteResourceSocket {
  closeCount = 0;
  readonly #closeListeners = new Set<(event: Event) => void>();
  readonly #errorListeners = new Set<(event: Event) => void>();
  readonly #messageListeners = new Set<(event: MessageEvent) => void>();
  readonly #openListeners = new Set<(event: Event) => void>();

  get listenerCount() {
    return (
      this.#closeListeners.size +
      this.#errorListeners.size +
      this.#messageListeners.size +
      this.#openListeners.size
    );
  }

  close() {
    this.closeCount += 1;
  }

  readonly sent: string[] = [];

  send(data: string) {
    this.sent.push(data);
  }

  onClose(listener: (event: Event) => void) {
    this.#closeListeners.add(listener);
    return () => this.#closeListeners.delete(listener);
  }

  onError(listener: (event: Event) => void) {
    this.#errorListeners.add(listener);
    return () => this.#errorListeners.delete(listener);
  }

  onMessage(listener: (event: MessageEvent) => void) {
    this.#messageListeners.add(listener);
    return () => this.#messageListeners.delete(listener);
  }

  onOpen(listener: (event: Event) => void) {
    this.#openListeners.add(listener);
    return () => this.#openListeners.delete(listener);
  }

  emitClose() {
    for (const listener of this.#closeListeners) {
      listener(new Event("close"));
    }
  }

  emitOpen() {
    for (const listener of this.#openListeners) {
      listener(new Event("open"));
    }
  }

  emitMessage(message: unknown) {
    const event = new MessageEvent("message", {
      data: JSON.stringify(message),
    });
    for (const listener of this.#messageListeners) {
      listener(event);
    }
  }

  emitError() {
    for (const listener of this.#errorListeners) {
      listener(new Event("error"));
    }
  }
}
