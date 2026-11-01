/**
 * Run the finos/vuu JMH benchmarks and read their JSON results. JMH runs
 * from the Maven classpath of a finos/vuu checkout (as the benchmark module's
 * exec-maven-plugin does) or, for checkouts that predate finos/vuu#2507, from
 * the shaded benchmark/target/benchmarks.jar.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type { ParamName } from "./benchmarks.ts";
import type { IterationSettings, Score } from "./harness.ts";

const PACKAGE = "org.finos.vuu.benchmark.";

export type JmhSource = { jar: string } | { classpath: string };

export interface JmhOptions {
  source: JmhSource;
  out: string;
  /** regex matched against benchmark names, as for the JMH command line */
  include?: string;
  /** restrict @Param values */
  params?: Partial<Record<ParamName, number[]>>;
  settings: IterationSettings;
  javaOpts: string[];
}

export interface JmhResults {
  scores: Map<string, Score>;
  jdk: string;
}

export const resultKey = (name: string, size: number) => `${name}|${size}`;

const seconds = (ms: number) => `${Math.max(1, Math.round(ms / 1000))}s`;

/**
 * Classpath of the benchmark module in a built finos/vuu checkout
 * (`mvn -pl benchmark -am install -DskipTests`). Resolved offline, so
 * nothing is written to the checkout.
 */
export function vuuClasspath(vuuDir: string) {
  const module = join(vuuDir, "benchmark");
  const classes = join(module, "target", "classes");
  if (!existsSync(join(classes, "META-INF", "BenchmarkList"))) {
    throw Error(
      `${classes} has no compiled benchmarks, run 'mvn -pl benchmark -am install -DskipTests' in ${vuuDir}`,
    );
  }
  const cpFile = join(tmpdir(), `vuu-jmh-cp-${Date.now()}.txt`);
  const { status, error } = spawnSync(
    "mvn",
    ["-q", "-o", "dependency:build-classpath", `-Dmdep.outputFile=${cpFile}`],
    { cwd: module, stdio: "inherit" },
  );
  if (error || status !== 0) {
    throw Error(
      `could not resolve the benchmark classpath (${error?.message ?? `mvn exit ${status}`})`,
    );
  }
  const dependencies = readFileSync(cpFile, "utf8").trim();
  rmSync(cpFile);
  return [classes, dependencies].join(delimiter);
}

export function runJmh({
  source,
  out,
  include,
  params = {},
  settings,
  javaOpts,
}: JmhOptions) {
  const args = [
    ...javaOpts,
    ...("jar" in source
      ? ["-jar", source.jar]
      : ["-cp", source.classpath, "org.openjdk.jmh.Main"]),
    ...(include ? [include] : []),
    ...Object.entries(params).flatMap(([name, sizes]) =>
      sizes && sizes.length ? ["-p", `${name}=${sizes.join(",")}`] : [],
    ),
    "-wi",
    String(settings.warmupIterations),
    "-w",
    seconds(settings.warmupMs),
    "-i",
    String(settings.iterations),
    "-r",
    seconds(settings.iterationMs),
    "-f",
    "1",
    "-rf",
    "json",
    "-rff",
    out,
  ];
  console.log(
    `java ${args.map((a) => (a.length > 200 ? `${a.slice(0, 60)}...` : a)).join(" ")}`,
  );
  const { status, error } = spawnSync("java", args, { stdio: "inherit" });
  if (error || status !== 0) {
    throw Error(`JMH run failed (${error?.message ?? `exit ${status}`})`);
  }
}

const toMs: Record<string, number> = {
  "ns/op": 1e-6,
  "us/op": 1e-3,
  "ms/op": 1,
  "s/op": 1e3,
};

interface JmhEntry {
  benchmark: string;
  jdkVersion: string;
  vmName: string;
  params?: Record<string, string>;
  primaryMetric: {
    score: number;
    scoreUnit: string;
    scorePercentiles: Record<string, number>;
    rawDataHistogram?: [number, number][][][];
  };
}

export function readJmh(path: string): JmhResults {
  const entries: JmhEntry[] = JSON.parse(readFileSync(path, "utf8"));
  const scores = new Map<string, Score>();
  let jdk = "";
  for (const { benchmark, params = {}, primaryMetric, ...rest } of entries) {
    jdk = `${rest.vmName} ${rest.jdkVersion}`;
    const scale = toMs[primaryMetric.scoreUnit];
    if (scale === undefined) continue;
    const size = Number(params.tableSize ?? params.insertSize);
    const pct = primaryMetric.scorePercentiles;
    let samples = 0;
    for (const fork of primaryMetric.rawDataHistogram ?? []) {
      for (const iteration of fork) {
        for (const [, count] of iteration) samples += count;
      }
    }
    scores.set(resultKey(benchmark.replace(PACKAGE, ""), size), {
      mean: primaryMetric.score * scale,
      p50: pct["50.0"] * scale,
      p90: pct["90.0"] * scale,
      p99: pct["99.0"] * scale,
      max: pct["100.0"] * scale,
      samples,
    });
  }
  return { scores, jdk };
}
