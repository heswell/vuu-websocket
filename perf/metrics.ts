import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * time  wall clock, noisy and machine dependent, generous tolerance
 * count deterministic counts (messages, rows sent), tight tolerance
 * size  bytes, near deterministic, tight tolerance
 */
export type MetricKind = "time" | "count" | "size";

export interface Metric {
  better: "lower" | "higher";
  description: string;
  kind: MetricKind;
  name: string;
  unit: string;
  value: number;
}

export interface PerfResults {
  meta: {
    bun: string;
    cpu: string;
    date: string;
    git?: string;
    iterations: number;
    platform: string;
  };
  metrics: Record<string, Metric>;
}

export const BASELINE_PATH = path.resolve(import.meta.dir, "baseline.json");

/** Allowed ratio vs the reference before a metric counts as a regression. */
export const tolerance = (kind: MetricKind) =>
  kind === "time"
    ? Number(process.env.PERF_TOLERANCE ?? (process.env.CI ? 5 : 3))
    : 1.1;

/** Absolute slack for timings, small values are dominated by noise. */
const TIME_SLACK_MS = 25;

export const limitFor = (metric: Metric, reference: number) => {
  const ratio = tolerance(metric.kind);
  if (metric.better === "lower") {
    return reference * ratio + (metric.kind === "time" ? TIME_SLACK_MS : 0);
  }
  return reference / ratio;
};

export const isRegression = (metric: Metric, reference: number) =>
  metric.better === "lower"
    ? metric.value > limitFor(metric, reference)
    : metric.value < limitFor(metric, reference);

/**
 * Changes smaller than this are run to run variation, not worth flagging.
 * Timings: within 10% or 1ms. Counts and sizes: within 1%.
 */
export const isNoise = (metric: Metric, reference: number) => {
  const delta = Math.abs(metric.value - reference);
  if (metric.kind === "time") {
    return delta < 1 || delta <= reference * 0.1;
  }
  return delta <= Math.abs(reference) * 0.01;
};

export const loadResults = (
  filePath = BASELINE_PATH,
): PerfResults | undefined =>
  fs.existsSync(filePath)
    ? (JSON.parse(fs.readFileSync(filePath, "utf8")) as PerfResults)
    : undefined;

export const createMeta = (iterations: number): PerfResults["meta"] => {
  const git = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"]);
  return {
    bun: Bun.version,
    cpu: os.cpus()[0]?.model ?? "unknown",
    date: new Date().toISOString(),
    git: git.success ? git.stdout.toString().trim() : undefined,
    iterations,
    platform: `${process.platform}-${process.arch}`,
  };
};

/** Merge metrics into a results file, test files run in the same process. */
export const appendResults = (
  filePath: string,
  metrics: Metric[],
  iterations: number,
) => {
  const results = loadResults(filePath) ?? {
    meta: createMeta(iterations),
    metrics: {},
  };
  for (const metric of metrics) {
    results.metrics[metric.name] = metric;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(results, null, 2) + "\n");
};

export const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
