import { afterAll } from "bun:test";
import {
  appendResults,
  isRegression,
  limitFor,
  loadResults,
  median,
  type Metric,
} from "./metrics";

/**
 * Number of samples per timed measurement, the median is recorded.
 * The perf script runs more iterations than a plain `bun test`.
 */
export const ITERATIONS = Math.max(1, Number(process.env.PERF_ITERATIONS ?? 1));

export const quiet = () => undefined;

/**
 * Records metrics for a perf test file. Each metric is checked against
 * perf/baseline.json (unless PERF_NO_ASSERT is set) and, when PERF_RESULTS
 * names a file, written there for comparison by scripts/perf.ts.
 */
export const createRecorder = () => {
  const baseline = loadResults();
  const metrics: Metric[] = [];

  afterAll(() => {
    if (process.env.PERF_RESULTS) {
      appendResults(process.env.PERF_RESULTS, metrics, ITERATIONS);
    }
  });

  return (metric: Metric) => {
    metrics.push(metric);
    const reference = baseline?.metrics[metric.name]?.value;
    if (
      !process.env.PERF_NO_ASSERT &&
      reference !== undefined &&
      isRegression(metric, reference)
    ) {
      throw Error(
        `perf regression ${metric.name}: ${metric.value}${metric.unit}, baseline ${reference}${metric.unit}, limit ${limitFor(metric, reference).toFixed(1)}${metric.unit}`,
      );
    }
  };
};

/** Median of ITERATIONS samples. */
export const sample = async (
  measure: (iteration: number) => number | Promise<number>,
) => {
  const values: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    values.push(await measure(i));
  }
  return round(median(values));
};

export const round = (value: number, places = 1) =>
  Math.round(value * 10 ** places) / 10 ** places;

export const elapsed = async (fn: () => unknown) => {
  const start = performance.now();
  await fn();
  return performance.now() - start;
};

export const waitFor = async (predicate: () => boolean, timeout = 10_000) => {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > timeout) {
      throw Error("timed out waiting for condition");
    }
    await Bun.sleep(2);
  }
};

/**
 * A raw websocket subscriber that records what arrives on the wire.
 */
export class WireClient {
  bytes = 0;
  messages = 0;
  snapshotBytes = 0;
  snapshotMessages = 0;
  snapshotRows = 0;
  updateBytes = 0;
  updateMessages = 0;
  updateRows = 0;

  /** resolves with ms from connect to snapshot complete */
  readonly snapshot: Promise<number>;

  #ws: WebSocket;

  constructor(url: string, request: Record<string, unknown>) {
    const start = performance.now();
    this.#ws = new WebSocket(url);
    this.snapshot = new Promise((resolve, reject) => {
      this.#ws.onopen = () => this.#ws.send(JSON.stringify(request));
      this.#ws.onclose = () => reject(Error("closed before snapshot"));
      this.#ws.onmessage = ({ data }) => {
        const text = data as string;
        const message = JSON.parse(text);
        this.messages += 1;
        this.bytes += text.length;
        switch (message.type) {
          case "snapshot-batch":
            this.snapshotMessages += 1;
            this.snapshotBytes += text.length;
            this.snapshotRows += message.rows.length;
            break;
          case "snapshot-count":
            this.snapshotMessages += 1;
            this.snapshotBytes += text.length;
            resolve(performance.now() - start);
            break;
          case "updates":
            this.updateMessages += 1;
            this.updateBytes += text.length;
            this.updateRows += message.rows.length;
            break;
          case "HB":
            this.#ws.send(JSON.stringify({ type: "HB", ts: message.ts }));
            break;
          case "error":
            reject(Error(message.message));
        }
      };
    });
  }

  waitForUpdateRows(count: number) {
    return waitFor(() => this.updateRows >= count);
  }

  close() {
    this.#ws.onclose = null;
    this.#ws.close();
  }
}

/** Writes with backpressure handling, Bun socket.write may be partial. */
class Pipe {
  #queue: Uint8Array[] = [];
  constructor(readonly socket: { write(data: Uint8Array): number; end(): void }) {}
  write(chunk: Uint8Array) {
    this.#queue.push(chunk);
    this.drain();
  }
  drain() {
    while (this.#queue.length) {
      const chunk = this.#queue[0];
      const written = this.socket.write(chunk);
      if (written < chunk.length) {
        this.#queue[0] = chunk.subarray(Math.max(0, written));
        return;
      }
      this.#queue.shift();
    }
  }
}

interface TapConnection {
  pending: Uint8Array[];
  toClient: Pipe;
  toServer?: Pipe;
}

/**
 * TCP proxy in front of a service that counts the bytes actually sent
 * server to client, i.e. after websocket framing and compression.
 * WireClient only sees decompressed message text.
 */
export class WireTap {
  /** server to client bytes, including the HTTP upgrade response */
  bytes = 0;
  /** the upgrade response accepted permessage-deflate */
  deflate = false;
  readonly url: string;
  #server: Bun.TCPSocketListener<TapConnection>;

  constructor(targetPort: number) {
    const tap = this;
    this.#server = Bun.listen<TapConnection>({
      hostname: "127.0.0.1",
      port: 0,
      socket: {
        open(client) {
          client.data = { pending: [], toClient: new Pipe(client) };
          Bun.connect({
            hostname: "127.0.0.1",
            port: targetPort,
            socket: {
              open(server) {
                client.data.toServer = new Pipe(server);
                client.data.pending.forEach((chunk) =>
                  client.data.toServer!.write(chunk),
                );
                client.data.pending = [];
              },
              data(_server, chunk) {
                if (tap.bytes === 0) {
                  tap.deflate = Buffer.from(chunk)
                    .toString("latin1")
                    .includes("permessage-deflate");
                }
                tap.bytes += chunk.length;
                client.data.toClient.write(new Uint8Array(chunk));
              },
              drain() {
                client.data.toServer?.drain();
              },
              close() {
                client.end();
              },
            },
          });
        },
        data(client, chunk) {
          const copy = new Uint8Array(chunk);
          if (client.data.toServer) {
            client.data.toServer.write(copy);
          } else {
            client.data.pending.push(copy);
          }
        },
        drain(client) {
          client.data.toClient.drain();
        },
        close(client) {
          client.data.toServer?.socket.end();
        },
      },
    });
    this.url = `ws://127.0.0.1:${this.#server.port}`;
  }

  stop() {
    this.#server.stop(true);
  }
}
