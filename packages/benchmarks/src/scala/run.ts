/**
 * Compare @heswell/vuu-table / @heswell/vuu-viewport with the Scala Vuu
 * engine, using the JMH benchmarks in finos/vuu benchmark/ as the reference.
 *
 *   bun packages/benchmarks/src/scala/run.ts
 *     [--vuu=<finos/vuu checkout>]  run JMH as well, from the Maven classpath
 *     [--jar=<benchmarks.jar>]     or from a shaded jar (older checkouts)
 *     [--jmh-results=<json>]       reuse results of an earlier JMH run
 *     [--jmh-out=<json>]           where to write JMH results
 *     [--only=<regex>]             benchmarks to run (both sides)
 *     [--max-size=<n>]             largest table size to run (both sides)
 *     [--scala-all-sizes]          ignore scalaMaxSize caps on the Scala side
 *     [--warmup-iterations=3] [--warmup=1000] [--iterations=5] [--time=1000]
 *     [--full]                     JMH annotation settings: 5 x 10s each
 *     [--out=<markdown file>]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cpus, tmpdir, totalmem } from "node:os";
import { dirname, join } from "node:path";
import { benchmarks, type ParityBenchmark } from "./benchmarks.ts";
import { runParityBenchmark, type Score } from "./harness.ts";
import {
  readJmh,
  resultKey,
  runJmh,
  vuuClasspath,
  type JmhResults,
} from "./jmh.ts";

const args: Record<string, string> = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [k, v = "true"] = arg.replace(/^--/, "").split("=");
    return [k, v];
  }),
);

const full = args.full === "true";
const settings = {
  warmupIterations: Number(args["warmup-iterations"] ?? (full ? 5 : 3)),
  warmupMs: Number(args.warmup ?? (full ? 10_000 : 1_000)),
  iterations: Number(args.iterations ?? 5),
  iterationMs: Number(args.time ?? (full ? 10_000 : 1_000)),
};
const only = args.only ? new RegExp(args.only) : undefined;
const maxSize = args["max-size"] ? Number(args["max-size"]) : undefined;
const vuuDir = args.vuu ?? process.env.VUU_DIR;
const jar = args.jar ?? process.env.VUU_BENCHMARK_JAR;
const out =
  args.out ?? join(import.meta.dir, "../../results/scala-comparison.md");

const selected = benchmarks.filter((b) => !only || only.test(b.name));
if (selected.length === 0) {
  throw Error(`no benchmarks match ${args.only}`);
}

const scalaAllSizes = args["scala-all-sizes"] === "true";
const sizesFor = (b: ParityBenchmark) =>
  maxSize === undefined ? b.sizes : b.sizes.filter((s) => s <= maxSize);
const scalaSizesFor = (b: ParityBenchmark) =>
  scalaAllSizes || b.scalaMaxSize === undefined
    ? sizesFor(b)
    : sizesFor(b).filter((s) => s <= b.scalaMaxSize!);

const git = (cwd: string, ...gitArgs: string[]) => {
  try {
    return execFileSync("git", ["-C", cwd, ...gitArgs], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
};

let jmh: JmhResults | undefined;
let scalaVersion = "";
if (args["jmh-results"]) {
  jmh = readJmh(args["jmh-results"]);
} else if (vuuDir || jar) {
  const jmhOut =
    args["jmh-out"] ?? join(tmpdir(), `vuu-jmh-${Date.now()}.json`);
  const source = vuuDir ? { classpath: vuuClasspath(vuuDir) } : { jar: jar! };
  // JMH -p applies to every benchmark that declares the param, so run JMH
  // once per distinct (param, sizes) and merge the JSON results.
  const groups = new Map<string, ParityBenchmark[]>();
  for (const b of selected) {
    const sizes = scalaSizesFor(b);
    if (sizes.length === 0) continue;
    const key = `${b.param}=${sizes.join(",")}`;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  const entries: unknown[] = [];
  for (const group of groups.values()) {
    const groupOut = `${jmhOut}.part`;
    const names = group.map((b) => b.name.replaceAll(".", "\\."));
    runJmh({
      source,
      out: groupOut,
      include: `\\.(${names.join("|")})$`,
      params: { [group[0].param]: scalaSizesFor(group[0]) },
      settings,
      // as configured for exec-maven-plugin in finos/vuu benchmark/pom.xml
      javaOpts: ["-Xmx12G", "-XX:+UseG1GC", "-XX:+UseStringDeduplication"],
    });
    entries.push(...JSON.parse(readFileSync(groupOut, "utf8")));
    rmSync(groupOut);
  }
  writeFileSync(jmhOut, JSON.stringify(entries, null, 2));
  console.log(`JMH results written to ${jmhOut}`);
  jmh = readJmh(jmhOut);
  scalaVersion = git(vuuDir ?? dirname(jar!), "log", "-1", "--format=%h %s");
}

const vuuScores = new Map<string, Score>();
for (const b of selected) {
  for (const size of sizesFor(b)) {
    const score = runParityBenchmark(b, size, settings);
    vuuScores.set(resultKey(b.name, size), score);
    console.log(
      `${b.name} ${b.param}=${size}: ${fmt(score.mean)} mean, ${fmt(score.p99)} p99 (${score.samples} samples)`,
    );
  }
}

function fmt(ms: number | undefined) {
  if (ms === undefined || Number.isNaN(ms)) return "-";
  if (ms < 1) return `${(ms * 1000).toPrecision(3)} µs`;
  if (ms < 1000) return `${ms.toPrecision(3)} ms`;
  return `${(ms / 1000).toPrecision(3)} s`;
}

const ratio = (scala?: Score, vuu?: Score) => {
  if (!scala || !vuu) return "-";
  const r = scala.mean / vuu.mean;
  if (r < 0.001) return "<0.001x";
  return `${r < 1000 ? r.toPrecision(3) : Math.round(r).toLocaleString("en")}x`;
};

const shortName = (name: string) => name.split(".").slice(1).join(".");

const lines = [
  "# vuu-viewport vs Scala Vuu (JMH benchmarks)",
  "",
  `Generated by \`bun run bench:scala\` on ${new Date().toISOString().slice(0, 10)}.`,
  "",
  `- Machine: ${cpus()[0]?.model ?? "unknown"}, ${cpus().length} cores, ${Math.round(totalmem() / 2 ** 30)} GB`,
  `- vuu-viewport: Bun ${(globalThis as any).Bun?.version ?? process.version}, commit ${git(".", "rev-parse", "--short", "HEAD") || "unknown"}`,
  `- Scala Vuu: ${jmh ? `${jmh.jdk}${scalaVersion ? `, finos/vuu ${scalaVersion}` : ""}` : "not run (pass --vuu, --jar or --jmh-results)"}`,
  `- Settings (both sides): ${settings.warmupIterations} x ${settings.warmupMs} ms warmup, ${settings.iterations} x ${settings.iterationMs} ms measurement, every invocation sampled (JMH SampleTime)`,
  "",
  "Times are per operation. Speed-up is Scala mean / vuu-viewport mean, so",
  "values above 1x mean vuu-viewport is faster.",
  "",
  "| Benchmark | Size | Scala mean | Scala p99 | vuu mean | vuu p99 | Speed-up |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
];
for (const b of selected) {
  for (const size of sizesFor(b)) {
    const key = resultKey(b.name, size);
    const scala = jmh?.scores.get(key);
    const vuu = vuuScores.get(key);
    const skipped = jmh && !scala && !scalaSizesFor(b).includes(size);
    const scalaMean = skipped ? "not run ¹" : fmt(scala?.mean);
    lines.push(
      `| ${shortName(b.name)} | ${size.toLocaleString("en")} | ${scalaMean} | ${fmt(scala?.p99)} | ${fmt(vuu?.mean)} | ${fmt(vuu?.p99)} | ${ratio(scala, vuu)} |`,
    );
  }
}
if (jmh && selected.some((b) => scalaSizesFor(b).length < sizesFor(b).length)) {
  lines.push(
    "",
    "¹ Not run on the Scala side because the JMH benchmark is too slow at this",
    "size (see below). Pass `--scala-all-sizes` to run it anyway.",
  );
}
lines.push("", "## What is measured", "");
for (const b of selected) {
  lines.push(
    `- **${shortName(b.name)}**`,
    `  - Scala: ${b.scala}`,
    `  - vuu-viewport: ${b.vuu}`,
    ...(b.scalaNote ? [`  - Note: ${b.scalaNote}`] : []),
  );
}
lines.push("");

const report = lines.join("\n");
console.log(`\n${report}`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, report);
console.log(`written to ${out}`);
