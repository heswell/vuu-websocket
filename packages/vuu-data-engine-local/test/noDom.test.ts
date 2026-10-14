// trader upstream issue 77: the main entry must import in plain Node/Bun,
// without a DOM. React bindings live in the /react entry.
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";

const TIMEOUT = 15_000;

const runFixture = async (fixture: string) => {
  const proc = Bun.spawn(
    ["bun", resolve(import.meta.dir, "fixtures", fixture)],
    {
      cwd: import.meta.dir,
      stderr: "pipe",
      stdout: "pipe",
    },
  );
  const timer = setTimeout(() => proc.kill(), TIMEOUT);
  const exitCode = await proc.exited;
  clearTimeout(timer);
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { exitCode, stderr, stdout };
};

describe("no DOM", () => {
  it(
    "the main entry imports and runs an engine without DOM globals",
    async () => {
      const { exitCode, stderr, stdout } = await runFixture(
        "import-without-dom.ts",
      );
      expect(stderr).not.toContain("is not defined");
      expect(exitCode).toBe(0);
      const report = JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}");
      expect(report.reactExports).toEqual([]);
      expect(report.tables).toBeGreaterThan(0);
    },
    TIMEOUT + 5_000,
  );
});
