/**
 * Minimal equivalent of JMH SampleTime mode: warmup and measurement
 * iterations of a fixed duration, each invocation timed individually.
 */
import type { ParityBenchmark } from "./benchmarks.ts";

export interface IterationSettings {
  warmupIterations: number;
  warmupMs: number;
  iterations: number;
  iterationMs: number;
}

export interface Score {
  /** mean ms/op */
  mean: number;
  p50: number;
  p90: number;
  p99: number;
  max: number;
  samples: number;
}

const gc = () => (globalThis as any).Bun?.gc?.(true);
const now = () => performance.now();

const percentile = (sorted: number[], p: number) => {
  if (sorted.length === 0) return NaN;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
};

export const toScore = (samples: number[]): Score => {
  const sorted = samples.slice().sort((a, b) => a - b);
  const mean = sorted.reduce((sum, t) => sum + t, 0) / sorted.length;
  return {
    mean,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1],
    samples: sorted.length,
  };
};

export function runParityBenchmark<S>(
  benchmark: ParityBenchmark<S>,
  size: number,
  settings: IterationSettings,
): Score {
  const { trial, iteration, invocation, run, after } = benchmark;
  const { warmupIterations, warmupMs, iterations, iterationMs } = settings;
  const samples: number[] = [];

  // silence any logging on hot paths
  const { log, info, debug, warn } = console;
  console.log = console.info = console.debug = console.warn = () => undefined;
  try {
    const state = trial(size);
    gc();
    for (let it = 0; it < warmupIterations + iterations; it++) {
      const measuring = it >= warmupIterations;
      iteration?.(state, size);
      const deadline = now() + (measuring ? iterationMs : warmupMs);
      do {
        invocation?.(state, size);
        const start = now();
        run(state, size);
        const elapsed = now() - start;
        after?.(state);
        if (measuring) samples.push(elapsed);
      } while (now() < deadline);
    }
  } finally {
    Object.assign(console, { log, info, debug, warn });
  }
  gc();
  return toScore(samples);
}
