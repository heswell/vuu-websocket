// trader upstream issue 20: importing the package has no side effects.
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import packageJson from "../package.json";

const FIXTURE = resolve(import.meta.dir, "fixtures/import-entry.ts");
const TIMEOUT = 15_000;

/** Import an entry point in a fresh process, which must exit by itself. */
const importInSubprocess = async (...args: string[]) => {
  const proc = Bun.spawn(["bun", FIXTURE, ...args], {
    cwd: import.meta.dir,
    stderr: "pipe",
    stdout: "pipe",
  });
  const timer = setTimeout(() => proc.kill(), TIMEOUT);
  const exitCode = await proc.exited;
  clearTimeout(timer);
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  if (exitCode !== 0) {
    throw Error(`subprocess exited with ${exitCode}\n${stderr}`);
  }
  return JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}") as {
    exports: string[];
    modules: string[];
    tables: number;
    timersAfterImport: number;
    timersAfterSubscribe?: number;
    timersAfterDispose?: number;
  };
};

describe("side effects", () => {
  it(
    "importing the main entry registers nothing, creates no tables and starts no timers",
    async () => {
      const report = await importInSubprocess("index");
      expect(report).toEqual({
        exports: [],
        modules: [],
        tables: 0,
        timersAfterImport: 0,
      });
    },
    TIMEOUT + 5_000,
  );

  it(
    "the deprecated /legacy entry registers the demo modules; timers start on use and stop on dispose",
    async () => {
      const report = await importInSubprocess("legacy", "subscribe", "dispose");
      expect(report.timersAfterImport).toBe(0);
      expect(report.timersAfterSubscribe).toBeGreaterThan(0);
      expect(report.timersAfterDispose).toBe(0);
      expect(report.modules.sort()).toEqual(
        [
          "BASKET",
          "MODULE_DISCOVERY",
          "NOTIFICATIONS",
          "SIMUL",
          "TEST",
          "USER_ADMIN",
        ].sort(),
      );
      expect(report.tables).toBeGreaterThan(0);
      expect(report.exports.sort()).toEqual(
        [
          "basketModule",
          "moduleAdminModule",
          "notificationsModule",
          "simulModule",
          "testModule",
          "userAdminModule",
        ].sort(),
      );
    },
    TIMEOUT + 5_000,
  );

  it("package.json declares only /legacy as having side effects", () => {
    expect(packageJson.sideEffects).toEqual(["./src/legacy.ts"]);
    expect(Object.keys(packageJson.exports)).toEqual([
      ".",
      "./react",
      "./legacy",
    ]);
  });
});
