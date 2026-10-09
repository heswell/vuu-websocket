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
