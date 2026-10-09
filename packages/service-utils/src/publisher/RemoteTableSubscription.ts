import type { Table } from "@heswell/vuu-table";
import type { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import {
  createRowMapper,
  defaultSocketFactory,
  type RemoteResourceSocket,
  type RemoteResourceSocketFactory,
} from "../resource-loader";
import type { ResourceMessage, ServerMessage, SubscriptionMode } from "./protocol";

export type RemoteSubscriptionStatus =
  | "idle"
  | "connecting"
  | "snapshot"
  | "live"
  | "complete"
  | "disconnected"
  | "stopped";

export interface ReconnectOptions {
  factor?: number;
  initialDelay?: number;
  maxDelay?: number;
}

export interface RemoteTableSubscriptionOptions {
  /**
   * Columns to request, defaults to the table columns, excluding vuu
   * timestamp columns which are maintained locally. Must include the key.
   */
  columns?: string[];
  /** Used as prefix for log messages */
  name?: string;
  log?: (message: string) => void;
  /** subscribe (default) = snapshot + live updates, snapshot = snapshot only */
  mode?: SubscriptionMode;
  reconnect?: ReconnectOptions;
  resource: string;
  socketFactory?: RemoteResourceSocketFactory;
  table: Table;
  url: string;
}

export interface RemoteTableSubscriptionStatus {
  reconnects: number;
  resource: string;
  rows: number;
  snapshots: number;
  status: RemoteSubscriptionStatus;
  url: string;
}

type Listener<T extends unknown[]> = (...args: T) => void;

const LOCAL_COLUMNS = new Set(["vuuCreatedTimestamp", "vuuUpdatedTimestamp"]);

/**
 * Maintains a local Table as a replica of a resource published by a remote
 * data service. The remote service does not need to be running when the
 * subscription is started, nor to remain available, connection is retried
 * with exponential backoff until stop is called.
 *
 * Each (re)connection receives a full snapshot. When the snapshot completes,
 * rows not present in the snapshot are removed, so the local table converges
 * on the remote state, without being cleared, after a reconnect.
 */
export class RemoteTableSubscription {
  readonly resource: string;
  readonly table: Table;
  readonly url: string;

  #attempt = 0;
  #firstSnapshot = Promise.withResolvers<number>();
  #listeners = {
    snapshot: new Set<Listener<[count: number, isFirst: boolean]>>(),
    status: new Set<Listener<[status: RemoteSubscriptionStatus]>>(),
  };
  #log: (message: string) => void;
  #mode: SubscriptionMode;
  #reconnect: Required<ReconnectOptions>;
  #reconnects = 0;
  #reconnectTimer: Timer | undefined;
  #removeSocketListeners: Array<() => void> = [];
  #requestColumns: string[];
  #seenKeys: Set<string> | undefined;
  #snapshots = 0;
  #socket: RemoteResourceSocket | undefined;
  #socketFactory: RemoteResourceSocketFactory;
  #status: RemoteSubscriptionStatus = "idle";
  #toTableRow: ((row: VuuDataRow) => VuuDataRow) | undefined;

  constructor({
    columns,
    log,
    mode = "subscribe",
    name,
    reconnect,
    resource,
    socketFactory = defaultSocketFactory,
    table,
    url,
  }: RemoteTableSubscriptionOptions) {
    this.resource = resource;
    this.table = table;
    this.url = url;
    this.#mode = mode;
    this.#socketFactory = socketFactory;
    this.#reconnect = {
      factor: reconnect?.factor ?? 2,
      initialDelay: reconnect?.initialDelay ?? 250,
      maxDelay: reconnect?.maxDelay ?? 5_000,
    };
    const prefix = `[${name ?? "RemoteTableSubscription"}:${resource}]`;
    const logger = log ?? console.log;
    this.#log = (message) => logger(`${prefix} ${message}`);

    const tableColumns = table.columns.map(({ name }) => name);
    this.#requestColumns =
      columns ?? tableColumns.filter((name) => !LOCAL_COLUMNS.has(name));
    if (!this.#requestColumns.includes(table.primaryKey)) {
      throw Error(
        `${prefix} requested columns must include key column '${table.primaryKey}'`,
      );
    }
    this.#toTableRow = createRowMapper(this.#requestColumns, tableColumns);
    // Avoid unhandled rejection if nobody is waiting when stopped
    this.#firstSnapshot.promise.catch(() => undefined);
  }

  /**
   * Resolves with the row count when the first snapshot has been received.
   * Rejects only if the subscription is stopped before that.
   */
  get firstSnapshot() {
    return this.#firstSnapshot.promise;
  }

  get hasSnapshot() {
    return this.#snapshots > 0;
  }

  get status() {
    return this.#status;
  }

  get health(): RemoteTableSubscriptionStatus {
    return {
      reconnects: this.#reconnects,
      resource: this.resource,
      rows: this.table.rowCount,
      snapshots: this.#snapshots,
      status: this.#status,
      url: this.url,
    };
  }

  onStatusChange(listener: Listener<[status: RemoteSubscriptionStatus]>) {
    this.#listeners.status.add(listener);
    return () => this.#listeners.status.delete(listener);
  }

  /**
   * Invoked each time a snapshot completes, isFirst is false after a reconnect.
   */
  onSnapshot(listener: Listener<[count: number, isFirst: boolean]>) {
    this.#listeners.snapshot.add(listener);
    return () => this.#listeners.snapshot.delete(listener);
  }

  start() {
    if (this.#status === "idle") {
      this.#connect();
    }
    return this;
  }

  stop() {
    if (this.#status === "stopped") {
      return;
    }
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = undefined;
    }
    this.#detachSocket(true);
    if (this.#snapshots === 0) {
      this.#firstSnapshot.reject(
        Error(`[RemoteTableSubscription] ${this.resource} stopped before snapshot`),
      );
    }
    this.#setStatus("stopped");
  }

  #setStatus(status: RemoteSubscriptionStatus) {
    if (status !== this.#status) {
      this.#status = status;
      for (const listener of this.#listeners.status) {
        listener(status);
      }
    }
  }

  #connect() {
    this.#reconnectTimer = undefined;
    this.#setStatus("connecting");
    let socket: RemoteResourceSocket;
    try {
      socket = this.#socketFactory(this.url);
    } catch (err) {
      this.#log(`unable to connect to ${this.url}, ${String(err)}`);
      this.#scheduleReconnect();
      return;
    }
    this.#socket = socket;
    this.#removeSocketListeners.push(
      socket.onOpen(() => {
        this.#log(`connected to ${this.url}`);
        socket.send(
          JSON.stringify({
            type: this.#mode,
            resource: this.resource,
            columns: this.#requestColumns,
          }),
        );
      }),
      socket.onMessage((evt) => {
        try {
          this.#handleMessage(
            JSON.parse(evt.data as string) as ServerMessage | ResourceMessage,
          );
        } catch (err) {
          this.#log(`error processing message, ${String(err)}`);
          this.#detachSocket(true);
          this.#scheduleReconnect();
        }
      }),
      // An error is always followed by close, reconnect is handled there.
      socket.onError(() => undefined),
      socket.onClose(() => {
        this.#detachSocket(false);
        if (this.#status !== "complete" && this.#status !== "stopped") {
          this.#scheduleReconnect();
        }
      }),
    );
  }

  #detachSocket(close: boolean) {
    for (const remove of this.#removeSocketListeners.splice(0)) {
      remove();
    }
    if (close) {
      this.#socket?.close();
    }
    this.#socket = undefined;
    this.#seenKeys = undefined;
  }

  #scheduleReconnect() {
    if (this.#reconnectTimer !== undefined || this.#status === "stopped") {
      return;
    }
    const { factor, initialDelay, maxDelay } = this.#reconnect;
    const delay = Math.min(maxDelay, initialDelay * factor ** this.#attempt);
    if (this.#attempt === 0 || delay < maxDelay) {
      this.#log(`${this.url} unavailable, retry in ${delay}ms`);
    }
    this.#attempt += 1;
    this.#reconnects += 1;
    this.#setStatus("disconnected");
    this.#reconnectTimer = setTimeout(() => this.#connect(), delay);
  }

  #upsert(row: VuuDataRow) {
    const tableRow = this.#toTableRow ? this.#toTableRow(row) : row;
    this.#seenKeys?.add(String(tableRow[this.table.indexOfKeyField]));
    this.table.upsert(tableRow);
  }

  #beginSnapshot() {
    if (this.#seenKeys === undefined) {
      this.#seenKeys = new Set();
      this.#setStatus("snapshot");
    }
  }

  #handleMessage(message: ServerMessage | ResourceMessage) {
    switch (message.type) {
      case "snapshot-batch":
        this.#beginSnapshot();
        for (const row of message.rows) {
          this.#upsert(row);
        }
        break;
      case "snapshot-count":
        this.#beginSnapshot();
        this.#completeSnapshot(message.count);
        break;
      case "updates":
        for (const row of message.rows) {
          this.#upsert(row);
        }
        break;
      case "deletes":
        for (const key of message.keys) {
          this.table.delete(key);
        }
        break;
      case "insert":
      case "update":
        this.#upsert(message.row);
        break;
      case "HB":
        this.#socket?.send(JSON.stringify({ type: "HB", ts: message.ts }));
        break;
      case "error":
        throw Error(`remote error: ${message.message}`);
    }
  }

  #completeSnapshot(count: number) {
    const seen = this.#seenKeys;
    this.#seenKeys = undefined;
    if (seen && this.table.rowCount > seen.size) {
      const staleKeys: string[] = [];
      for (const key of this.table.keys) {
        if (!seen.has(key)) {
          staleKeys.push(key);
        }
      }
      for (const key of staleKeys) {
        this.table.delete(key);
      }
    }
    const isFirst = this.#snapshots === 0;
    this.#snapshots += 1;
    this.#attempt = 0;
    this.#log(`snapshot complete, ${count} rows`);

    if (this.#mode === "snapshot") {
      this.#detachSocket(true);
      this.#setStatus("complete");
    } else {
      this.#setStatus("live");
    }
    if (isFirst) {
      this.#firstSnapshot.resolve(count);
    }
    for (const listener of this.#listeners.snapshot) {
      listener(count, isFirst);
    }
  }
}
