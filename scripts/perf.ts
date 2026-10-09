import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  BASELINE_PATH,
  createMeta,
  isNoise,
  isRegression,
  loadResults,
  type PerfResults,
} from "../perf/metrics";

const usage = `Run the perf suite (perf/*.perf.test.ts) and compare with a reference.

  bun scripts/perf.ts                        compare with perf/baseline.json
  bun scripts/perf.ts --save before.json     also save this run
  bun scripts/perf.ts --compare before.json  compare with a saved run
  bun scripts/perf.ts --update-baseline      write this run to perf/baseline.json

Options:
  --iterations <n>  samples per timing, median is reported (default 5)
  --filter <text>   only run perf test files whose path contains text

Exits 1 if any metric regressed beyond tolerance (PERF_TOLERANCE for timings,
default 3x, 10% for counts and sizes). Status ≈ marks changes within noise
(10% or 1ms for timings, 1% for counts and sizes).`;

const { values: args } = parseArgs({
  options: {
    compare: { type: "string" },
    filter: { type: "string" },
    help: { type: "boolean" },
    iterations: { type: "string", default: "5" },
    save: { type: "string" },
    "update-baseline": { type: "boolean" },
  },
});

if (args.help) {
  console.log(usage);
  process.exit(0);
}

const iterations = Number(args.iterations);
const resultsPath =
  args.save !== undefined
    ? path.resolve(args.save)
    : path.join(os.tmpdir(), `vuu-perf-${process.pid}.json`);
await Bun.file(resultsPath)
  .delete()
  .catch(() => undefined);

const testPaths = Array.from(new Bun.Glob("perf/*.perf.test.ts").scanSync())
  .filter((file) => !args.filter || file.includes(args.filter))
  .map((file) => `./${file}`);

console.log(`running ${testPaths.join(", ")}, ${iterations} iterations`);
const proc = Bun.spawnSync(["bun", "test", ...testPaths], {
  env: {
    ...process.env,
    PERF_ITERATIONS: String(iterations),
    PERF_NO_ASSERT: "1",
    PERF_RESULTS: resultsPath,
  },
  stderr: "pipe",
  stdout: "pipe",
});
if (!proc.success) {
  console.error(proc.stdout.toString(), proc.stderr.toString());
  process.exit(1);
}

const current = loadResults(resultsPath) as PerfResults;
current.meta = createMeta(iterations);

if (args["update-baseline"]) {
  await Bun.write(BASELINE_PATH, JSON.stringify(current, null, 2) + "\n");
  console.log(`baseline written to ${path.relative(".", BASELINE_PATH)}`);
}

const referencePath = args.compare ? path.resolve(args.compare) : BASELINE_PATH;
const reference = args["update-baseline"]
  ? undefined
  : loadResults(referencePath);

const describeRun = ({ meta }: PerfResults) =>
  `${meta.git ?? "?"} ${meta.date.slice(0, 16)} ${meta.platform} ${meta.cpu} bun ${meta.bun}`;

console.log(`\ncurrent:   ${describeRun(current)}`);
if (reference) {
  console.log(
    `reference: ${describeRun(reference)} (${referencePath})`,
  );
}

const rows = Object.values(current.metrics).map((metric) => {
  const ref = reference?.metrics[metric.name]?.value;
  const change =
    ref === undefined || ref === 0
      ? ""
      : `${metric.value >= ref ? "+" : ""}${(((metric.value - ref) / ref) * 100).toFixed(0)}%`;
  const improved =
    ref !== undefined &&
    (metric.better === "lower" ? metric.value < ref : metric.value > ref);
  const status =
    ref === undefined
      ? "new"
      : isRegression(metric, ref)
        ? "REGRESSED"
        : metric.value === ref
          ? "="
          : isNoise(metric, ref)
            ? "≈"
            : improved
              ? "better"
              : "worse (within tolerance)";
  return {
    metric: metric.name,
    unit: metric.unit,
    reference: ref ?? "",
    current: metric.value,
    change,
    status,
  };
});

console.table(rows);

const regressions = rows.filter((row) => row.status === "REGRESSED");
if (regressions.length > 0) {
  console.log(`${regressions.length} regression(s)`);
  process.exit(1);
}
if (args.save) {
  console.log(`results saved to ${resultsPath}`);
} else {
  await Bun.file(resultsPath).delete();
}
