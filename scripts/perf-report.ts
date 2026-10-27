import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { PerfResults } from "../perf/metrics";

export const BENCHMARK_SUITE = "Vuu performance";
const HISTORY_PREFIX = "window.BENCHMARK_DATA = ";

export interface BenchmarkEntry {
  name: string;
  unit: string;
  value: number;
  range?: string;
  extra?: string;
}

export interface LocalBenchmarkResults {
  files: {
    groups: {
      fullName: string;
      benchmarks: {
        name: string;
        mean: number;
        rme: number;
        sampleCount: number;
      }[];
    }[];
  }[];
}

/** Output of the engine-only scale bench (vuu-data-engine-local bench:scale). */
export interface LocalScaleResults {
  meta: {
    cpu: string;
    node: string;
    platform: string;
    rows: number;
    samples: number;
  };
  metrics: {
    better: string;
    description: string;
    kind: string;
    name: string;
    unit: string;
    value: number;
  }[];
}

const checkValue = (name: string, value: number) => {
  if (!Number.isFinite(value) || value < 0) {
    throw Error(`invalid benchmark value for ${name}: ${value}`);
  }
};

export function benchmarkEntries(
  services: PerfResults,
  outbound: PerfResults,
  local: LocalBenchmarkResults,
  nodeVersion: string,
  runUrl: string,
  scale?: LocalScaleResults,
): BenchmarkEntry[] {
  const entries: BenchmarkEntry[] = [];
  for (const results of [services, outbound]) {
    const metrics = Object.values(results.metrics);
    if (metrics.length === 0) throw Error("empty performance results");
    for (const metric of metrics) {
      if (metric.better !== "lower") {
        throw Error(`expected smaller-is-better metric: ${metric.name}`);
      }
      entries.push({
        name: metric.name,
        unit: metric.unit,
        value: metric.value,
        extra: [
          metric.description,
          `Bun ${results.meta.bun}, ${results.meta.platform}, ${results.meta.cpu}`,
          `Timing samples: ${results.meta.iterations} where supported`,
          runUrl,
        ].join("\n"),
      });
    }
  }

  let localCount = 0;
  for (const file of local.files) {
    for (const group of file.groups) {
      for (const benchmark of group.benchmarks) {
        if (!(benchmark.sampleCount > 0)) {
          throw Error(`no samples for ${group.fullName} / ${benchmark.name}`);
        }
        entries.push({
          name: `local.${group.fullName} / ${benchmark.name}`,
          unit: "ms",
          value: benchmark.mean,
          range: `${benchmark.rme.toFixed(2)}% RME`,
          extra: [
            `Mean of ${benchmark.sampleCount} samples, Node ${nodeVersion}`,
            `${services.meta.platform}, ${services.meta.cpu}`,
            runUrl,
          ].join("\n"),
        });
        localCount++;
      }
    }
  }
  if (localCount === 0) throw Error("no local engine benchmarks reported");

  if (scale) {
    if (scale.metrics.length === 0) throw Error("empty local scale results");
    for (const metric of scale.metrics) {
      if (metric.better !== "lower") {
        throw Error(`expected smaller-is-better metric: ${metric.name}`);
      }
      entries.push({
        name: `local-scale.${metric.name}`,
        unit: metric.unit,
        value: metric.value,
        extra: [
          metric.description,
          `Node ${scale.meta.node}, ${scale.meta.platform}, ${scale.meta.cpu}`,
          runUrl,
        ].join("\n"),
      });
    }
  }
  const names = new Set<string>();
  for (const entry of entries) {
    if (!entry.name || !entry.unit) throw Error("benchmark name and unit required");
    checkValue(entry.name, entry.value);
    if (names.has(entry.name)) throw Error(`duplicate benchmark: ${entry.name}`);
    names.add(entry.name);
  }
  return entries;
}

interface HistoryRun {
  commit: { id: string; url: string };
  benches: BenchmarkEntry[];
}

export function previousRun(script: string): HistoryRun | undefined {
  if (!script.startsWith(HISTORY_PREFIX)) {
    throw Error("unrecognized benchmark history format");
  }
  const history: { entries: Record<string, HistoryRun[]> } = JSON.parse(
    script.slice(HISTORY_PREFIX.length),
  );
  const runs = history.entries[BENCHMARK_SUITE];
  return runs?.at(-1);
}

const cell = (text: string) => text.replaceAll("|", "\\|").replaceAll(/\r?\n/g, " ");

export function comparisonSummary(
  entries: BenchmarkEntry[],
  previous?: HistoryRun,
): string {
  const reference = new Map(previous?.benches.map((entry) => [entry.name, entry]));
  const lines = [
    "## Performance results",
    "",
    previous
      ? `Compared with latest published main run: [${previous.commit.id.slice(0, 7)}](${previous.commit.url}).`
      : "No published main baseline yet. The first successful main run establishes the reference.",
    "",
    "Lower is better. Negative changes are improvements. Timing changes are advisory on shared runners.",
    "",
    "| Metric | Current | Main | Change |",
    "| --- | ---: | ---: | ---: |",
  ];
  for (const entry of entries) {
    const before = reference.get(entry.name);
    if (before) {
      checkValue(before.name, before.value);
      if (before.unit !== entry.unit) {
        throw Error(`benchmark unit changed for ${entry.name}`);
      }
    }
    const delta =
      before === undefined
        ? "new"
        : before.value === 0
          ? entry.value === 0
            ? "0%"
            : "increase from zero"
          : `${entry.value >= before.value ? "+" : ""}${((entry.value / before.value - 1) * 100).toFixed(1)}%`;
    lines.push(
      `| ${cell(entry.name)} | ${entry.value.toFixed(3)} ${cell(entry.unit)} | ${before ? `${before.value.toFixed(3)} ${cell(before.unit)}` : "-"} | ${delta} |`,
    );
  }
  return lines.join("\n") + "\n";
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      services: { type: "string" },
      outbound: { type: "string" },
      local: { type: "string" },
      "local-scale": { type: "string" },
      out: { type: "string" },
      summary: { type: "string" },
      history: { type: "string" },
    },
  });
  const required = (key: keyof typeof values) => {
    const value = values[key];
    if (!value) throw Error(`--${key} is required`);
    return value;
  };
  const runUrl = process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : "Local run";
  const entries = benchmarkEntries(
    JSON.parse(readFileSync(required("services"), "utf8")),
    JSON.parse(readFileSync(required("outbound"), "utf8")),
    JSON.parse(readFileSync(required("local"), "utf8")),
    execFileSync("node", ["--version"], { encoding: "utf8" }).trim(),
    runUrl,
    values["local-scale"]
      ? JSON.parse(readFileSync(values["local-scale"], "utf8"))
      : undefined,
  );
  const previous =
    values.history && existsSync(values.history)
      ? previousRun(readFileSync(values.history, "utf8"))
      : undefined;
  writeFileSync(required("out"), JSON.stringify(entries, null, 2) + "\n");
  writeFileSync(required("summary"), comparisonSummary(entries, previous));
}
