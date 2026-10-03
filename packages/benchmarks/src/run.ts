/**
 * Benchmark runner. Compares the legacy @heswell/data DataView with the
 * @heswell/vuu-viewport InMemoryViewport engine.
 *
 *   bun packages/benchmarks/src/run.ts [--rows=100000] [--iterations=5]
 *     [--engine=legacy|vuu-viewport] [--filter=<scenario substring>]
 *     [--out=<path to markdown results file>] [--budget=<ms>]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { legacyAdapter } from "./adapters/legacy.ts";
import { nextAdapter } from "./adapters/next.ts";
import { generateRows } from "./data.ts";
import { buildScenarios, type Scenario } from "./scenarios.ts";
import type { EngineAdapter } from "./types.ts";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [k, v = "true"] = arg.replace(/^--/, "").split("=");
    return [k, v];
  }),
);

const rowCount = Number(args.rows ?? 100_000);
const iterations = Number(args.iterations ?? 5);
const engines: EngineAdapter[] = [legacyAdapter, nextAdapter].filter(
  (a) => !args.engine || a.name === args.engine,
);

interface Result {
  median: number;
  min: number;
  check: string;
  error?: string;
}

const BUDGET_MS = Number(args.budget ?? 5_000);

const gc = () => (globalThis as any).Bun?.gc?.(true);

const measure = (
  scenario: Scenario<unknown>,
  adapter: EngineAdapter,
  rows: ReturnType<typeof generateRows>,
): Result => {
  const times: number[] = [];
  let check = "";
  // legacy code logs on hot paths, silence for both engines
  const { log, info, debug } = console;
  console.log = console.info = console.debug = () => undefined;
  try {
    // first iteration is warmup
    for (let i = 0; i <= iterations; i++) {
      const state = scenario.setup({ adapter, rows });
      gc();
      const start = performance.now();
      check = String(scenario.run(state));
      const elapsed = performance.now() - start;
      scenario.teardown?.(state);
      if (i > 0 || elapsed > BUDGET_MS) times.push(elapsed);
      // very slow scenarios are measured once only
      if (elapsed > BUDGET_MS) break;
    }
  } finally {
    Object.assign(console, { log, info, debug });
  }
  times.sort((a, b) => a - b);
  return { median: times[Math.floor(times.length / 2)], min: times[0], check };
};

const fmt = (n: number) =>
  n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);

const main = () => {
  console.log(
    `Generating ${rowCount} rows, ${iterations} iterations (+1 warmup), engines: ${engines
      .map((e) => e.name)
      .join(", ")}`,
  );
  const rows = generateRows(rowCount);
  const scenarios = buildScenarios(rowCount).filter(
    (s) => !args.filter || s.name.includes(args.filter),
  );

  const header = [
    "Scenario",
    ...engines.map((e) => `${e.name} (ms)`),
    ...(engines.length === 2 ? ["speedup"] : []),
    "check",
  ];
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
  ];
  console.log(lines.join("\n"));

  for (const scenario of scenarios) {
    const results: Result[] = engines.map((engine) => {
      try {
        return measure(scenario, engine, rows);
      } catch (err) {
        return {
          median: NaN,
          min: NaN,
          check: "",
          error: String((err as Error)?.message ?? err).slice(0, 40),
        };
      }
    });
    const cells = results.map((r) =>
      r.error ? `error: ${r.error}` : `${fmt(r.median)}`,
    );
    const speedup =
      engines.length === 2
        ? [
            results.some((r) => r.error)
              ? "n/a"
              : `${(results[0].median / results[1].median).toFixed(1)}x`,
          ]
        : [];
    const checks = [...new Set(results.map((r) => r.check))];
    const line = `| ${[scenario.name, ...cells, ...speedup, checks.join(" / ")].join(" | ")} |`;
    lines.push(line);
    console.log(line);
  }

  if (args.out) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(
      args.out,
      [
        `# Benchmark results: ${rowCount} rows`,
        "",
        `Bun ${(globalThis as any).Bun?.version}, ${process.platform}/${process.arch}, median of ${iterations} iterations (+1 warmup).`,
        "",
        ...lines,
        "",
      ].join("\n"),
    );
    console.log(`results written to ${args.out}`);
  }
};

main();
