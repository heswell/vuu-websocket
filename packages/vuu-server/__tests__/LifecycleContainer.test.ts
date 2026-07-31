import { describe, expect, test } from "bun:test";
import {
  DefaultLifecycleEnabled,
  LifecycleContainer,
} from "../src/toolbox/thread/LifecycleContainer";

type Hook = () => void | Promise<void>;

class TestComponent extends DefaultLifecycleEnabled {
  constructor(
    readonly lifecycleId: string,
    private readonly events: string[],
    private readonly hooks: {
      initialize?: Hook;
      start?: Hook;
      stop?: Hook;
      destroy?: Hook;
    } = {},
  ) {
    super();
  }

  async doInitialize() {
    this.events.push(`initialize:${this.lifecycleId}`);
    await this.hooks.initialize?.();
  }

  async doStart() {
    this.events.push(`start:${this.lifecycleId}`);
    await this.hooks.start?.();
  }

  async doStop() {
    this.events.push(`stop:${this.lifecycleId}`);
    await this.hooks.stop?.();
  }

  async doDestroy() {
    this.events.push(`destroy:${this.lifecycleId}`);
    await this.hooks.destroy?.();
  }
}

describe("LifecycleContainer", () => {
  test("awaits dependencies first and tears down in reverse deterministic order", async () => {
    const lifecycle = new LifecycleContainer();
    const events: string[] = [];
    const first = new TestComponent("same-id", events);
    const second = new TestComponent("same-id", events);
    const root = new TestComponent("root", events);

    lifecycle.apply(root).dependsOn(first, second);

    await lifecycle.start();
    await lifecycle.destroy();

    expect(events).toEqual([
      "initialize:same-id",
      "initialize:same-id",
      "initialize:root",
      "start:same-id",
      "start:same-id",
      "start:root",
      "stop:root",
      "stop:same-id",
      "stop:same-id",
      "destroy:root",
      "destroy:same-id",
      "destroy:same-id",
    ]);
  });

  test("detects dependency cycles before invoking components", async () => {
    const lifecycle = new LifecycleContainer();
    const events: string[] = [];
    const first = new TestComponent("first", events);
    const second = new TestComponent("second", events);

    lifecycle.apply(first).dependsOn(second);
    lifecycle.apply(second).dependsOn(first);

    await expect(lifecycle.start()).rejects.toThrow(
      "dependency cycle: first -> second -> first",
    );
    await lifecycle.destroy();
    expect(events).toEqual([]);
  });

  test("rolls back partial async startup", async () => {
    const lifecycle = new LifecycleContainer();
    const events: string[] = [];
    const first = new TestComponent("first", events);
    const second = new TestComponent("second", events, {
      start: async () => {
        await Bun.sleep(1);
        throw new Error("start failed");
      },
    });

    lifecycle.apply(second).dependsOn(first);

    await expect(lifecycle.start()).rejects.toThrow("start failed");
    expect(events).toEqual([
      "initialize:first",
      "initialize:second",
      "start:first",
      "start:second",
      "stop:second",
      "stop:first",
      "destroy:second",
      "destroy:first",
    ]);
  });

  test("coalesces concurrent start and keeps start, stop, and destroy idempotent", async () => {
    const lifecycle = new LifecycleContainer();
    const events: string[] = [];
    const component = new TestComponent("component", events, {
      start: () => Bun.sleep(5),
    });
    lifecycle.apply(component);

    await Promise.all([lifecycle.start(), lifecycle.start()]);
    await lifecycle.start();
    await Promise.all([lifecycle.stop(), lifecycle.stop()]);
    await lifecycle.stop();
    await Promise.all([lifecycle.destroy(), lifecycle.destroy()]);
    await lifecycle.destroy();

    expect(events).toEqual([
      "initialize:component",
      "start:component",
      "stop:component",
      "destroy:component",
    ]);
  });

  test("coordinates concurrent stop and destroy transitions", async () => {
    const lifecycle = new LifecycleContainer();
    const events: string[] = [];
    const component = new TestComponent("component", events, {
      stop: () => Bun.sleep(5),
    });
    lifecycle.apply(component);
    await lifecycle.start();

    await Promise.all([lifecycle.stop(), lifecycle.destroy()]);

    expect(events).toEqual([
      "initialize:component",
      "start:component",
      "stop:component",
      "destroy:component",
    ]);
  });

  test("finishes startup cancellation before destroying the component", async () => {
    const lifecycle = new LifecycleContainer();
    const events: string[] = [];
    const startEntered = Promise.withResolvers<void>();
    const releaseStart = Promise.withResolvers<void>();
    const releaseStop = Promise.withResolvers<void>();
    const component = new TestComponent("component", events, {
      start: async () => {
        startEntered.resolve();
        await releaseStart.promise;
      },
      stop: async () => {
        events.push("stop-begin");
        releaseStart.resolve();
        await releaseStop.promise;
        events.push("stop-end");
      },
    });
    lifecycle.apply(component);

    const startup = lifecycle.start();
    await startEntered.promise;
    const shutdown = lifecycle.destroy();
    await Bun.sleep(1);
    expect(events).not.toContain("destroy:component");

    releaseStop.resolve();
    const [startupResult, shutdownResult] = await Promise.allSettled([
      startup,
      shutdown,
    ]);
    expect(startupResult.status).toBe("rejected");
    expect(shutdownResult.status).toBe("fulfilled");
    expect(events).toEqual([
      "initialize:component",
      "start:component",
      "stop:component",
      "stop-begin",
      "stop-end",
      "destroy:component",
    ]);
  });

  test("installs and removes centralized Node shutdown hooks idempotently", () => {
    const lifecycle = new LifecycleContainer();
    const before = process.listenerCount("SIGTERM");

    lifecycle.installShutdownHooks(["SIGTERM"]);
    lifecycle.installShutdownHooks(["SIGTERM"]);
    expect(process.listenerCount("SIGTERM")).toBe(before + 1);

    lifecycle.removeShutdownHooks();
    expect(process.listenerCount("SIGTERM")).toBe(before);
  });
});
