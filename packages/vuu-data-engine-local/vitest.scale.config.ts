import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

// Engine-only scale bench (bench/scale.bench-run.ts): a single long test run
// in one forked Node process with --expose-gc, so heap can be measured.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ["bench/scale.bench-run.ts"],
      environment: "node",
      pool: "forks",
      poolOptions: { forks: { singleFork: true, execArgv: ["--expose-gc"] } },
      testTimeout: 30 * 60_000,
      reporters: ["default"],
    },
  }),
);
