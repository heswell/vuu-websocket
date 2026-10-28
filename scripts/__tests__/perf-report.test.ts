import { describe, expect, test } from "bun:test";
import type { Metric, PerfResults } from "../../perf/metrics";
import {
  BENCHMARK_SUITE,
  benchmarkEntries,
  comparisonSummary,
  formatSpeedup,
  legacyComparisonSummary,
  legacyComparisons,
  previousRun,
  type LocalBenchmarkResults,
  type LocalScaleResults,
} from "../perf-report";

const metric: Metric = {
  better: "lower",
  description: "snapshot",
  kind: "time",
  name: "publisher.snapshot.time",
  unit: "ms",
  value: 10,
};

const results = (metrics: Metric[] = [metric]): PerfResults => ({
  meta: {
    bun: "1.3.14",
    cpu: "test CPU",
    date: "2026-10-23T00:00:00Z",
    iterations: 5,
    platform: "linux-x64",
  },
  metrics: Object.fromEntries(metrics.map((entry) => [entry.name, entry])),
});

const local = (): LocalBenchmarkResults => ({
  files: [
    {
      groups: [
        {
          fullName: "bench/datasource.bench.ts > sort (100000 rows)",
          benchmarks: [
            { name: "engine", mean: 2, rme: 1.5, sampleCount: 100 },
            { name: "legacy", mean: 4, rme: 2, sampleCount: 50 },
          ],
        },
      ],
    },
  ],
});

const outbound = () =>
  results([{ ...metric, name: "outbound.tick.time", value: 5 }]);

const entries = () =>
  benchmarkEntries(
    results(),
    outbound(),
    local(),
    "v24.16.0",
    "https://github.com/heswell/vuu-websocket/actions/runs/1",
  );

describe("performance chart entries", () => {
  test("combines all suites without losing precision or runtime metadata", () => {
    const report = entries();
    expect(report).toHaveLength(4);
    expect(report[0]).toMatchObject({
      name: metric.name,
      unit: "ms",
      value: 10,
    });
    expect(report[0].extra).toContain("Bun 1.3.14, linux-x64, test CPU");
    expect(report[0].extra).toContain("/actions/runs/1");
    expect(report[2]).toMatchObject({
      name: "local.bench/datasource.bench.ts > sort (100000 rows) / engine",
      value: 2,
      range: "1.50% RME",
    });
    expect(report[2].extra).toContain("Mean of 100 samples, Node v24.16.0");
  });

  test("retains zero-valued deterministic metrics", () => {
    const report = benchmarkEntries(
      results([{ ...metric, value: 0 }]),
      outbound(),
      local(),
      "v24.16.0",
      "local",
    );
    expect(report[0].value).toBe(0);
  });

  test.each([NaN, Infinity, -1])("rejects invalid metric %s", (value) => {
    expect(() =>
      benchmarkEntries(
        results([{ ...metric, value }]),
        outbound(),
        local(),
        "node",
        "local",
      ),
    ).toThrow("invalid benchmark value");
  });

  test("rejects empty suites and duplicate metric names", () => {
    expect(() =>
      benchmarkEntries(results([]), outbound(), local(), "node", "local"),
    ).toThrow("empty performance results");
    expect(() =>
      benchmarkEntries(results(), results(), local(), "node", "local"),
    ).toThrow("duplicate benchmark");
    expect(() =>
      benchmarkEntries(results(), outbound(), { files: [] }, "node", "local"),
    ).toThrow("no local engine benchmarks");
  });

  test("rejects incompatible metric directions", () => {
    expect(() =>
      benchmarkEntries(
        results([{ ...metric, better: "higher" }]),
        outbound(),
        local(),
        "node",
        "local",
      ),
    ).toThrow("expected smaller-is-better");
  });

  test("rejects local benchmarks without samples", () => {
    const input = local();
    input.files[0].groups[0].benchmarks[0].sampleCount = 0;
    expect(() =>
      benchmarkEntries(results(), outbound(), input, "node", "local"),
    ).toThrow("no samples");
  });
});

describe("local engine scale results", () => {
  const scale = (): LocalScaleResults => ({
    meta: {
      cpu: "test CPU",
      node: "v24.16.0",
      platform: "linux-x64",
      rows: 1_000_000,
      samples: 5,
    },
    metrics: [
      {
        better: "lower",
        description: "Sort on price",
        kind: "time",
        name: "sort numeric column (1000000 rows)",
        unit: "ms",
        value: 220.5,
      },
      {
        better: "lower",
        description: "Engine table heap",
        kind: "size",
        name: "heap: table (1000000 rows)",
        unit: "MB",
        value: 222.4,
      },
    ],
  });
  const withScale = (input = scale()) =>
    benchmarkEntries(results(), outbound(), local(), "v24.16.0", "local", input);

  test("are optional", () => {
    expect(entries()).toHaveLength(4);
  });

  test("are appended with their own prefix, unit and runtime", () => {
    const report = withScale();
    expect(report).toHaveLength(6);
    expect(report[4]).toMatchObject({
      name: "local-scale.sort numeric column (1000000 rows)",
      unit: "ms",
      value: 220.5,
    });
    expect(report[5]).toMatchObject({
      name: "local-scale.heap: table (1000000 rows)",
      unit: "MB",
      value: 222.4,
    });
    expect(report[5].extra).toContain("Node v24.16.0, linux-x64, test CPU");
  });

  test("rejects empty results, bad values and larger-is-better metrics", () => {
    expect(() => withScale({ ...scale(), metrics: [] })).toThrow(
      "empty local scale results",
    );
    const nan = scale();
    nan.metrics[0].value = NaN;
    expect(() => withScale(nan)).toThrow("invalid benchmark value");
    const higher = scale();
    higher.metrics[0].better = "higher";
    expect(() => withScale(higher)).toThrow("expected smaller-is-better");
  });
});

describe("published history comparison", () => {
  const run = {
    commit: { id: "1234567890", url: "https://github.com/heswell/vuu-websocket/commit/1234567890" },
    benches: [{ name: metric.name, unit: "ms", value: 20 }],
  };
  const history = (runs: typeof run[]) =>
    `window.BENCHMARK_DATA = ${JSON.stringify({
      entries: { [BENCHMARK_SUITE]: runs },
    })}`;

  test("reads only JSON and compares with the latest published main run", () => {
    const previous = previousRun(history([{ ...run, benches: [] }, run]));
    expect(previous).toEqual(run);
    const summary = comparisonSummary(entries(), previous);
    expect(summary).toContain("[1234567]");
    expect(summary).toContain("-50.0%");
    expect(summary).toContain("| new |");
  });

  test("handles first run and a new suite", () => {
    expect(previousRun(history([]))).toBeUndefined();
    expect(previousRun('window.BENCHMARK_DATA = {"entries":{}}')).toBeUndefined();
    expect(comparisonSummary(entries())).toContain("No published main baseline");
  });

  test("rejects malformed history rather than executing or resetting it", () => {
    expect(() => previousRun("alert('not JSON')")).toThrow(
      "unrecognized benchmark history format",
    );
    expect(() => previousRun("window.BENCHMARK_DATA = broken")).toThrow();
  });

  test("reports increases and zero baselines without NaN or Infinity", () => {
    const current = [{ name: metric.name, unit: "ms", value: 30 }];
    expect(comparisonSummary(current, run)).toContain("+50.0%");
    const zero = { ...run, benches: [{ ...run.benches[0], value: 0 }] };
    expect(comparisonSummary(current, zero)).toContain("increase from zero");
    expect(comparisonSummary(zero.benches, zero)).toContain("| 0% |");
  });

  test("rejects unit changes", () => {
    expect(() =>
      comparisonSummary([{ name: metric.name, unit: "s", value: 1 }], run),
    ).toThrow("benchmark unit changed");
  });

  test("escapes names that could break markdown tables", () => {
    expect(
      comparisonSummary([{ name: "one|two\nthree", unit: "ms", value: 1 }]),
    ).toContain("one\\|two three");
  });
});

describe("local engine vs legacy comparison", () => {
  const name = (scenario: string, impl: string) =>
    `local.bench/datasource.bench.ts > ${scenario} (100000 rows) / ${impl}`;
  const current = [
    { name: name("sort", "legacy TickingArrayDataSource"), value: 80 },
    { name: name("sort", "engine ModuleDataSource"), value: 20 },
    { name: name("groupBy", "legacy TickingArrayDataSource"), value: 2 },
    { name: name("groupBy", "engine ModuleDataSource"), value: 3 },
    { name: name("legacy only", "legacy TickingArrayDataSource"), value: 1 },
    { name: "local-scale.sort (1000000 rows)", value: 200 },
    { name: metric.name, value: 10 },
  ];
  const previous = {
    commit: { id: "abcdef0123", url: "https://github.com/heswell/vuu-websocket/commit/abcdef0123" },
    benches: [{ name: name("sort", "engine ModuleDataSource"), unit: "ms", value: 25 }],
  };

  test("pairs legacy and engine per scenario, in bench order, skipping unpaired", () => {
    expect(legacyComparisons(current, previous)).toEqual([
      { scenario: "sort (100000 rows)", legacy: 80, engine: 20, engineBefore: 25 },
      { scenario: "groupBy (100000 rows)", legacy: 2, engine: 3, engineBefore: undefined },
    ]);
  });

  test("formats speed-ups in both directions", () => {
    expect(formatSpeedup(80, 20)).toBe("4.00x faster");
    expect(formatSpeedup(2, 3)).toBe("1.50x slower");
    expect(formatSpeedup(3000, 1)).toBe("3000x faster");
    expect(formatSpeedup(1, 0)).toBe("-");
  });

  test("renders a markdown table with the engine change against main", () => {
    const summary = legacyComparisonSummary(current, previous);
    expect(summary).toContain("## Local engine vs legacy");
    expect(summary).toContain("compare.html");
    expect(summary).toContain("| sort (100000 rows) | 80.0 ms | 20.0 ms | 4.00x faster | -20.0% |");
    expect(summary).toContain("| groupBy (100000 rows) | 2.0 ms | 3.0 ms | 1.50x slower | - |");
    expect(summary).not.toContain("legacy only");
  });

  test("is empty when there are no paired results", () => {
    expect(legacyComparisonSummary([{ name: metric.name, value: 1 }])).toBe("");
  });
});
