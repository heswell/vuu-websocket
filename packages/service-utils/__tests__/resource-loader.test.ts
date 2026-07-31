import { describe, expect, test } from "bun:test";
import { Table } from "@heswell/data";
import { TableSchema } from "@vuu-ui/vuu-data-types";
import {
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

  send() {}

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

  emitError() {
    for (const listener of this.#errorListeners) {
      listener(new Event("error"));
    }
  }
}
