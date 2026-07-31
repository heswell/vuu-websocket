import { describe, expect, test } from "bun:test";
import { LifeCycleRunner } from "../src/toolbox/thread/LifeCycleRunner";

describe("LifeCycleRunner", () => {
  test("awaits async callbacks so repeated runs never overlap", async () => {
    let active = 0;
    let maxActive = 0;
    let runCount = 0;
    const runner = new LifeCycleRunner(
      "non-overlap",
      async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        runCount += 1;
        await Bun.sleep(5);
        active -= 1;
      },
      1,
    );

    await runner.doStart();
    await Bun.sleep(20);
    await runner.doStop();
    const countAfterStop = runCount;
    await Bun.sleep(10);

    expect(runCount).toBeGreaterThan(1);
    expect(maxActive).toBe(1);
    expect(runCount).toBe(countAfterStop);
  });

  test("stop waits for an in-flight callback and prevents rescheduling", async () => {
    const inFlight = Promise.withResolvers<void>();
    const secondRunStarted = Promise.withResolvers<void>();
    let runCount = 0;
    const runner = new LifeCycleRunner(
      "coordinated-stop",
      async () => {
        runCount += 1;
        if (runCount === 2) {
          secondRunStarted.resolve();
          await inFlight.promise;
        }
      },
      1,
    );

    await runner.doStart();
    await secondRunStarted.promise;
    let stopped = false;
    const stopPromise = runner.doStop().then(() => {
      stopped = true;
    });
    await Bun.sleep(1);
    expect(stopped).toBe(false);

    inFlight.resolve();
    await stopPromise;
    await Bun.sleep(5);
    expect(runCount).toBe(2);
  });

  test("propagates startup errors and reports later callback errors", async () => {
    const startupRunner = new LifeCycleRunner("startup-error", async () => {
      throw new Error("startup failed");
    });
    await expect(startupRunner.doStart()).rejects.toThrow("startup failed");

    const reported = Promise.withResolvers<unknown>();
    let runCount = 0;
    const scheduledRunner = new LifeCycleRunner(
      "scheduled-error",
      async () => {
        runCount += 1;
        if (runCount === 2) {
          throw new Error("scheduled failed");
        }
      },
      1,
      reported.resolve,
    );
    await scheduledRunner.doStart();

    expect(await reported.promise).toEqual(new Error("scheduled failed"));
    await scheduledRunner.doDestroy();
  });
});
