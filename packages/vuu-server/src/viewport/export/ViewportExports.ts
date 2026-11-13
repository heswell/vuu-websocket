import type {
  VuuDataRow,
  VuuRowDataItemType,
} from "@vuu-ui/vuu-protocol-types";
import { getLogger } from "@heswell/service-utils/browser";
import type { Viewport } from "../Viewport";
import { ClientRequestError } from "../../net/ClientRequestError";

const log = getLogger("vuu.export");

/** Viewport RPC that snapshots a viewport for export over HTTP. */
export const EXPORT_VIEWPORT_RPC = "EXPORT_VIEWPORT";

export type ViewportExportOptions = {
  /** Rows serialised per pull of the HTTP stream. Default 2,000. */
  chunkRows?: number;
  /** Unclaimed snapshots are released after this. Default 30s. */
  claimTtlMs?: number;
  /** A stream still running after this is cancelled. Default 10 min. */
  maxStreamMs?: number;
  /** Largest viewport that can be exported. Default 2,000,000 rows. */
  maxRows?: number;
  /** Snapshots (unclaimed or streaming) a session may hold. Default 2. */
  maxPerSession?: number;
};

export type ExportTicket = {
  exportId: string;
  /** Path on the REST server, e.g. /api/export/<id> */
  path: string;
  /** Absolute url, when the REST server url is known */
  url?: string;
  columns: string[];
  rowCount: number;
  expiresAt: number;
};

export type ExportStats = {
  exportId: string;
  table: string;
  rowCount: number;
  rowsSent: number;
  bytes: number;
  chunks: number;
  snapshotMs: number;
  /** claim to close */
  streamMs: number;
  /** longest synchronous serialisation of one chunk */
  maxChunkMs: number;
  outcome: "complete" | "cancelled" | "expired" | "timeout";
};

type Snapshot = {
  id: string;
  sessionId: string;
  userName: string;
  table: string;
  columns: string[];
  colIdx: Int32Array;
  /**
   * Row array references, in viewport order. Table rows are replaced, not
   * mutated, on update (Table.update/updateByKey, JoinTable), so these are
   * the values at the moment of the snapshot.
   */
  rows: VuuDataRow[];
  createdAt: number;
  snapshotMs: number;
  claimTimer?: ReturnType<typeof setTimeout>;
  state: "pending" | "streaming" | "released";
};

const yieldToEventLoop =
  typeof setImmediate === "function"
    ? () => new Promise<void>((resolve) => setImmediate(resolve))
    : () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const jsonValue = (value: unknown): VuuRowDataItemType => {
  if (typeof value === "bigint") {
    return value >= MIN_SAFE && value <= MAX_SAFE
      ? Number(value)
      : value.toString();
  }
  return value === undefined ? null! : (value as VuuRowDataItemType);
};

/**
 * Point in time snapshots of viewports, streamed to the client over HTTP as
 * NDJSON (first line the column names, then one JSON array per row).
 *
 * The export data never goes on the websocket: the outbound queue merges
 * updates per viewport row and every frame is sent in order, so a multi-MB
 * export frame would delay the ticks queued behind it. Over HTTP the
 * stream is pulled by the client, a chunk at a time, yielding to the event
 * loop between chunks so the publish cycle is never stalled for longer than
 * one chunk's serialisation.
 */
export class ViewportExports {
  #snapshots = new Map<string, Snapshot>();
  #options: Required<ViewportExportOptions>;
  #path = "/api/export";
  #baseUrl: () => string | undefined = () => undefined;
  readonly completed: ExportStats[] = [];

  constructor(options: ViewportExportOptions = {}) {
    this.#options = {
      chunkRows: options.chunkRows ?? 2_000,
      claimTtlMs: options.claimTtlMs ?? 30_000,
      maxStreamMs: options.maxStreamMs ?? 600_000,
      maxRows: options.maxRows ?? 2_000_000,
      maxPerSession: options.maxPerSession ?? 2,
    };
  }

  configure({
    path,
    baseUrl,
    ...options
  }: ViewportExportOptions & {
    path?: string;
    baseUrl?: () => string | undefined;
  }) {
    if (path) this.#path = path;
    if (baseUrl) this.#baseUrl = baseUrl;
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined) {
        (this.#options as Record<string, number>)[key] = value as number;
      }
    }
  }

  get path() {
    return this.#path;
  }

  get size() {
    return this.#snapshots.size;
  }

  /**
   * Snapshot the viewport's current rows (sort, filter, permission and link
   * filters applied) and return a one-time ticket for the HTTP fetch.
   */
  create(viewport: Viewport, requestedColumns?: unknown): ExportTicket {
    if (viewport.hasGroupBy) {
      throw new ClientRequestError(
        "export of a grouped viewport is not supported",
      );
    }
    const sessionId = viewport.sessionId;
    let held = 0;
    for (const s of this.#snapshots.values()) {
      if (s.sessionId === sessionId) held += 1;
    }
    if (held >= this.#options.maxPerSession) {
      throw new ClientRequestError(
        `too many exports in progress (${held}), try again later`,
      );
    }

    const viewportColumns = viewport.columns;
    const columns = Array.isArray(requestedColumns)
      ? requestedColumns.map(String)
      : viewportColumns;
    // only columns the client is subscribed to: never more than it can see
    const allowed = new Set(viewportColumns);
    const unknown = columns.filter((c) => !allowed.has(c));
    if (unknown.length > 0) {
      throw new ClientRequestError(
        `columns not in viewport: ${unknown.join(", ")}`,
      );
    }
    const engine = viewport.engine;
    const { columnMap, rows: tableRows } = engine.table;
    const colIdx = Int32Array.from(columns, (c) => columnMap[c] ?? -1);

    const start = performance.now();
    // applies pending table changes, publishing them to the client as usual
    viewport.flush();
    const size = engine.size;
    if (size > this.#options.maxRows) {
      throw new ClientRequestError(
        `viewport has ${size} rows, export limit is ${this.#options.maxRows}`,
      );
    }
    const rows = new Array<VuuDataRow>(size);
    for (let pos = 0; pos < size; pos++) {
      rows[pos] = tableRows[engine.rowIndexAt(pos)];
    }
    const snapshotMs = performance.now() - start;

    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const snapshot: Snapshot = {
      id,
      sessionId,
      userName: viewport.user.name,
      table: engine.table.name,
      columns,
      colIdx,
      rows,
      createdAt,
      snapshotMs,
      state: "pending",
    };
    snapshot.claimTimer = setTimeout(
      () => this.#release(snapshot, "expired"),
      this.#options.claimTtlMs,
    );
    this.#snapshots.set(id, snapshot);
    log.info(
      `export ${id} ${snapshot.table} ${size} rows x ${columns.length} cols, snapshot ${snapshotMs.toFixed(1)}ms (${viewport.user.name})`,
    );

    const path = `${this.#path}/${id}`;
    const baseUrl = this.#baseUrl();
    return {
      exportId: id,
      path,
      url: baseUrl ? `${baseUrl}${path}` : undefined,
      columns,
      rowCount: size,
      expiresAt: createdAt + this.#options.claimTtlMs,
    };
  }

  /**
   * Claim a snapshot (once) and stream it. Undefined if the id is unknown,
   * expired or already claimed.
   */
  stream(id: string): ReadableStream<Uint8Array> | undefined {
    const snapshot = this.#snapshots.get(id);
    if (snapshot === undefined || snapshot.state !== "pending") {
      return undefined;
    }
    clearTimeout(snapshot.claimTimer);
    snapshot.state = "streaming";

    const { colIdx, columns } = snapshot;
    const rowCount = snapshot.rows.length;
    const chunkRows = this.#options.chunkRows;
    const encoder = new TextEncoder();
    const claimedAt = performance.now();
    const stats: ExportStats = {
      exportId: id,
      table: snapshot.table,
      rowCount,
      rowsSent: 0,
      bytes: 0,
      chunks: 0,
      snapshotMs: snapshot.snapshotMs,
      streamMs: 0,
      maxChunkMs: 0,
      outcome: "complete",
    };
    let pos = 0;
    let headerSent = false;
    const projected = new Array<VuuRowDataItemType>(colIdx.length);
    const finish = (outcome: ExportStats["outcome"]) => {
      if (snapshot.state !== "streaming") return;
      stats.outcome = outcome;
      stats.streamMs = performance.now() - claimedAt;
      this.#release(snapshot, outcome, stats);
    };
    const timeout = setTimeout(() => {
      finish("timeout");
      try {
        controllerRef?.error(new Error("export stream timed out"));
      } catch {
        // already closed
      }
    }, this.#options.maxStreamMs);
    let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;

    return new ReadableStream<Uint8Array>(
      {
        start(controller) {
          controllerRef = controller;
        },
        pull: async (controller) => {
          if (snapshot.state !== "streaming") return;
          if (!headerSent) {
            headerSent = true;
            const header = encoder.encode(`${JSON.stringify(columns)}\n`);
            stats.bytes += header.byteLength;
            controller.enqueue(header);
            return;
          }
          // let the publish cycle, websocket and timers run between chunks
          await yieldToEventLoop();
          if (snapshot.state !== "streaming") return;
          const t0 = performance.now();
          const rows = snapshot.rows;
          const end = Math.min(pos + chunkRows, rowCount);
          let text = "";
          for (; pos < end; pos++) {
            const row = rows[pos];
            for (let i = 0; i < colIdx.length; i++) {
              projected[i] = jsonValue(row[colIdx[i]]);
            }
            text += `${JSON.stringify(projected)}\n`;
          }
          const bytes = encoder.encode(text);
          const ms = performance.now() - t0;
          if (ms > stats.maxChunkMs) stats.maxChunkMs = ms;
          stats.chunks += 1;
          stats.rowsSent = pos;
          stats.bytes += bytes.byteLength;
          controller.enqueue(bytes);
          if (pos >= rowCount) {
            clearTimeout(timeout);
            controller.close();
            finish("complete");
          }
        },
        cancel: () => {
          clearTimeout(timeout);
          finish("cancelled");
        },
      },
      // one chunk buffered: the client's reads drive serialisation
      { highWaterMark: 1 },
    );
  }

  #release(
    snapshot: Snapshot,
    outcome: ExportStats["outcome"],
    stats?: ExportStats,
  ) {
    clearTimeout(snapshot.claimTimer);
    if (this.#snapshots.get(snapshot.id) !== snapshot) return;
    this.#snapshots.delete(snapshot.id);
    snapshot.state = "released";
    // drop the row references now, even if the stream object lingers
    snapshot.rows = [];
    if (stats) {
      this.completed.push(stats);
      if (this.completed.length > 20) this.completed.shift();
      log.info(
        `export ${snapshot.id} ${outcome}: ${stats.rowsSent}/${stats.rowCount} rows, ${(stats.bytes / 1e6).toFixed(1)}MB, ${stats.chunks} chunks in ${stats.streamMs.toFixed(0)}ms, max chunk ${stats.maxChunkMs.toFixed(1)}ms`,
      );
    } else {
      log.info(`export ${snapshot.id} ${outcome}`);
    }
  }

  /** Release every snapshot (server stop). */
  clear() {
    for (const snapshot of [...this.#snapshots.values()]) {
      this.#release(snapshot, "cancelled");
    }
  }
}
