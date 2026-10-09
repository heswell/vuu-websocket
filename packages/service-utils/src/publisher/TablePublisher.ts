import type { Table, TableListener } from "@heswell/vuu-table";
import type { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import type { SubscriptionMode } from "./protocol";

/**
 * The subset of a (Bun) ServerWebSocket used by the publisher. send returns
 * -1 when the message was queued due to backpressure, 0 if it was dropped,
 * otherwise the number of bytes sent.
 */
export interface SubscriberSocket {
  getBufferedAmount(): number;
  send(data: string, compress?: boolean): number;
}

export interface TablePublisherOptions {
  /** Max bytes buffered on a socket before snapshot streaming pauses until drain */
  highWaterMark?: number;
  /** Max rows serialized into a single updates message */
  maxRowsPerUpdate?: number;
  /**
   * When false, subscriptions are accepted but snapshots are deferred until
   * setReady is invoked, e.g. while upstream dependencies are loading.
   */
  ready?: boolean;
  /** Name clients use to subscribe, defaults to the table name */
  resource?: string;
  snapshotBatchSize?: number;
  table: Table;
}

export interface SubscribeOptions {
  columns?: string[];
  /** compress messages, requires permessage-deflate to have been negotiated */
  compress?: boolean;
  mode?: SubscriptionMode;
}

type SubscriberState = "waiting" | "snapshot" | "live";

const DEFAULT_SNAPSHOT_BATCH_SIZE = 1_000;
const DEFAULT_MAX_ROWS_PER_UPDATE = 5_000;
const DEFAULT_HIGH_WATER_MARK = 1024 * 1024;

/**
 * Subscribers requesting the same columns share a projection group, so
 * each update is projected and serialized once per group, not per subscriber.
 */
class ProjectionGroup {
  readonly subscribers = new Set<Subscriber>();
  constructor(
    readonly key: string,
    readonly indices: number[] | undefined,
  ) {}

  get hasActiveSubscribers() {
    for (const subscriber of this.subscribers) {
      if (subscriber.state !== "waiting") {
        return true;
      }
    }
    return false;
  }

  project(rows: VuuDataRow[]): VuuDataRow[] {
    const { indices } = this;
    if (indices === undefined) {
      return rows;
    }
    const colCount = indices.length;
    const out: VuuDataRow[] = new Array(rows.length);
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const projected: VuuDataRow = new Array(colCount);
      for (let i = 0; i < colCount; i++) {
        projected[i] = row[indices[i]];
      }
      out[r] = projected;
    }
    return out;
  }
}

class Subscriber {
  pending: string[] = [];
  snapshotIndex = 0;
  snapshotRows: VuuDataRow[] | undefined;
  state: SubscriberState = "waiting";
  constructor(
    readonly socket: SubscriberSocket,
    readonly group: ProjectionGroup,
    readonly mode: SubscriptionMode,
    readonly compress: boolean,
  ) {}

  send(message: string) {
    this.socket.send(message, this.compress);
  }

  deliver(message: string) {
    if (this.state === "live") {
      this.send(message);
    } else if (this.state === "snapshot") {
      this.pending.push(message);
    }
    // waiting subscribers receive everything in their snapshot
  }
}

export interface TablePublisherStatus {
  ready: boolean;
  resource: string;
  rows: number;
  subscribers: number;
}

/**
 * Publishes the content of a Table to remote subscribers. Any mutation of
 * the table (insert/update/delete) is captured via a TableListener, so data
 * generators need know nothing about publishing, they just mutate the table.
 *
 * - updates are conflated by key between flushes, only the latest
 *   version of a row is sent
 * - each flush serializes once per distinct column projection
 * - snapshots are a point-in-time copy streamed with backpressure, updates
 *   that occur while a snapshot is streaming are sent once it completes
 * - nothing is accumulated while there are no subscribers
 */
export class TablePublisher {
  readonly resource: string;
  readonly table: Table;

  #deleted = new Set<string>();
  #dirty = new Set<string>();
  #groups = new Map<string, ProjectionGroup>();
  #highWaterMark: number;
  #maxRowsPerUpdate: number;
  #ready: boolean;
  #resnapshot = false;
  #snapshotBatchSize: number;
  #subscribers = new Map<SubscriberSocket, Subscriber>();
  #tableColumns: string[];

  constructor({
    highWaterMark = DEFAULT_HIGH_WATER_MARK,
    maxRowsPerUpdate = DEFAULT_MAX_ROWS_PER_UPDATE,
    ready = true,
    resource,
    snapshotBatchSize = DEFAULT_SNAPSHOT_BATCH_SIZE,
    table,
  }: TablePublisherOptions) {
    this.table = table;
    this.resource = resource ?? table.name;
    this.#highWaterMark = highWaterMark;
    this.#maxRowsPerUpdate = maxRowsPerUpdate;
    this.#ready = ready;
    this.#snapshotBatchSize = snapshotBatchSize;
    this.#tableColumns = table.columns.map(({ name }) => name);
    table.addListener(this.#tableListener);
  }

  get ready() {
    return this.#ready;
  }

  get subscriberCount() {
    return this.#subscribers.size;
  }

  get status(): TablePublisherStatus {
    return {
      ready: this.#ready,
      resource: this.resource,
      rows: this.table.rowCount,
      subscribers: this.#subscribers.size,
    };
  }

  setReady() {
    if (!this.#ready) {
      this.#ready = true;
      for (const subscriber of this.#subscribers.values()) {
        if (subscriber.state === "waiting") {
          this.#startSnapshot(subscriber);
        }
      }
    }
  }

  /**
   * @throws if a requested column does not exist
   */
  subscribe(
    socket: SubscriberSocket,
    { columns, compress = false, mode = "subscribe" }: SubscribeOptions = {},
  ) {
    this.unsubscribe(socket);
    const group = this.#getGroup(columns);
    const subscriber = new Subscriber(socket, group, mode, compress);
    this.#subscribers.set(socket, subscriber);
    group.subscribers.add(subscriber);
    if (this.#ready) {
      this.#startSnapshot(subscriber);
    }
  }

  unsubscribe(socket: SubscriberSocket) {
    const subscriber = this.#subscribers.get(socket);
    if (subscriber) {
      this.#remove(subscriber);
    }
  }

  isSubscribed(socket: SubscriberSocket) {
    return this.#subscribers.has(socket);
  }

  /**
   * Resume a snapshot paused due to backpressure.
   */
  onDrain(socket: SubscriberSocket) {
    const subscriber = this.#subscribers.get(socket);
    if (subscriber?.state === "snapshot") {
      this.#pumpSnapshot(subscriber);
    }
  }

  /**
   * Publish all changes since the last flush. Returns number of rows published.
   */
  flush() {
    if (this.#resnapshot) {
      this.#resnapshot = false;
      this.#dirty.clear();
      this.#deleted.clear();
      for (const subscriber of this.#subscribers.values()) {
        if (subscriber.state !== "waiting") {
          this.#startSnapshot(subscriber);
        }
      }
      return 0;
    }

    const dirty = this.#dirty;
    const deleted = this.#deleted;
    if (dirty.size === 0 && deleted.size === 0) {
      return 0;
    }

    const { resource, table } = this;
    const rows: VuuDataRow[] = [];
    for (const key of dirty) {
      const row = table.getRowAtKey(key, false);
      if (row !== undefined) {
        rows.push(row);
      }
    }
    const deletedKeys = deleted.size > 0 ? Array.from(deleted) : undefined;
    dirty.clear();
    deleted.clear();

    const chunkSize = this.#maxRowsPerUpdate;
    for (const group of this.#groups.values()) {
      if (!group.hasActiveSubscribers) {
        continue;
      }
      const projected = group.project(rows);
      for (let i = 0; i < projected.length; i += chunkSize) {
        const message = JSON.stringify({
          type: "updates",
          resource,
          rows:
            projected.length <= chunkSize
              ? projected
              : projected.slice(i, i + chunkSize),
        });
        for (const subscriber of group.subscribers) {
          subscriber.deliver(message);
        }
      }
      if (deletedKeys) {
        const message = JSON.stringify({
          type: "deletes",
          resource,
          keys: deletedKeys,
        });
        for (const subscriber of group.subscribers) {
          subscriber.deliver(message);
        }
      }
    }
    return rows.length;
  }

  dispose() {
    this.table.removeListener(this.#tableListener);
    for (const subscriber of Array.from(this.#subscribers.values())) {
      this.#remove(subscriber);
    }
  }

  #tableListener: TableListener = {
    onInsert: (_rowIdx, row) => this.#markDirty(row),
    onUpdate: (_rowIdx, row) => this.#markDirty(row),
    onDelete: (_rowIdx, row) => {
      if (this.#subscribers.size > 0) {
        const key = String(row[this.table.indexOfKeyField]);
        this.#dirty.delete(key);
        this.#deleted.add(key);
      }
    },
    // We have no record of the keys removed, so subscribers are sent a fresh
    // snapshot, which consumers reconcile against their existing data.
    onClear: () => {
      if (this.#subscribers.size > 0) {
        this.#resnapshot = true;
      }
    },
  };

  #markDirty(row: VuuDataRow) {
    if (this.#subscribers.size > 0) {
      const key = String(row[this.table.indexOfKeyField]);
      this.#deleted.delete(key);
      this.#dirty.add(key);
    }
  }

  #getGroup(columns?: string[]) {
    const tableColumns = this.#tableColumns;
    let indices: number[] | undefined = undefined;
    if (columns !== undefined) {
      const { columnMap } = this.table;
      indices = columns.map((name) => {
        const index = columnMap[name];
        if (index === undefined) {
          throw Error(
            `[TablePublisher] ${this.resource} has no column '${name}'`,
          );
        }
        return index;
      });
      if (
        indices.length === tableColumns.length &&
        indices.every((index, i) => index === i)
      ) {
        indices = undefined;
      }
    }
    const key = indices === undefined ? "*" : indices.join(",");
    let group = this.#groups.get(key);
    if (group === undefined) {
      group = new ProjectionGroup(key, indices);
      this.#groups.set(key, group);
    }
    return group;
  }

  #remove(subscriber: Subscriber) {
    this.#subscribers.delete(subscriber.socket);
    const { group } = subscriber;
    group.subscribers.delete(subscriber);
    if (group.subscribers.size === 0) {
      this.#groups.delete(group.key);
    }
    subscriber.pending.length = 0;
    subscriber.snapshotRows = undefined;
    if (this.#subscribers.size === 0) {
      this.#dirty.clear();
      this.#deleted.clear();
      this.#resnapshot = false;
    }
  }

  #startSnapshot(subscriber: Subscriber) {
    const { rows } = this.table;
    subscriber.state = "snapshot";
    subscriber.pending.length = 0;
    subscriber.snapshotIndex = 0;
    // Rows are replaced, not mutated, by Table.update so a shallow copy is
    // a consistent point-in-time snapshot.
    subscriber.snapshotRows =
      subscriber.group.indices === undefined
        ? rows.slice()
        : subscriber.group.project(rows);
    this.#pumpSnapshot(subscriber);
  }

  #pumpSnapshot(subscriber: Subscriber) {
    const { resource } = this;
    const { socket } = subscriber;
    const rows = subscriber.snapshotRows ?? [];
    const count = rows.length;
    const batchSize = this.#snapshotBatchSize;

    while (subscriber.snapshotIndex < count) {
      const start = subscriber.snapshotIndex;
      const end = Math.min(start + batchSize, count);
      subscriber.snapshotIndex = end;
      subscriber.send(
        JSON.stringify({
          type: "snapshot-batch",
          resource,
          isLast: end === count,
          rows: rows.slice(start, end),
        }),
      );
      if (
        end < count &&
        socket.getBufferedAmount() > this.#highWaterMark
      ) {
        return;
      }
    }

    subscriber.send(
      JSON.stringify({ type: "snapshot-count", resource, count }),
    );
    subscriber.snapshotRows = undefined;

    if (subscriber.mode === "snapshot") {
      this.#remove(subscriber);
    } else {
      subscriber.state = "live";
      const { pending } = subscriber;
      subscriber.pending = [];
      for (const message of pending) {
        subscriber.send(message);
      }
    }
  }
}
