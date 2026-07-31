import { DefaultLifecycleEnabled } from "./LifecycleContainer";

type RunnerCallback = () => void | Promise<void>;
type RunnerErrorHandler = (error: unknown) => void;

export class LifeCycleRunner extends DefaultLifecycleEnabled {
  readonly lifecycleId: string;
  #isRunning = false;
  #intervalId: ReturnType<typeof setTimeout> | undefined;
  #activeRun: Promise<void> | undefined;

  constructor(
    private readonly name: string,
    private readonly func: RunnerCallback,
    private readonly minCycleTime = 100,
    private readonly onError: RunnerErrorHandler = (error) => {
      console.error(`[LifeCycleRunner:${name}] callback failed`, error);
    },
  ) {
    super();
    this.lifecycleId = `lifeCycleRunner-${name}`;
  }

  async doStart() {
    if (this.#isRunning) {
      return;
    }

    this.#isRunning = true;
    try {
      // Await the first pass so lifecycle startup cannot report readiness early.
      await this.runOnce();
    } catch (error: unknown) {
      this.#isRunning = false;
      throw error;
    }
    this.scheduleNext();
  }

  async doStop() {
    this.#isRunning = false;
    if (this.#intervalId !== undefined) {
      clearTimeout(this.#intervalId);
      this.#intervalId = undefined;
    }
    await this.#activeRun;
  }

  async doDestroy() {
    await this.doStop();
  }

  private scheduleNext() {
    if (!this.#isRunning) {
      return;
    }
    this.#intervalId = setTimeout(() => {
      this.#intervalId = undefined;
      void this.runScheduled();
    }, this.minCycleTime);
  }

  private async runScheduled() {
    try {
      await this.runOnce();
    } catch (error: unknown) {
      this.#isRunning = false;
      this.onError(error);
      return;
    }
    this.scheduleNext();
  }

  private runOnce() {
    const activeRun = Promise.resolve().then(this.func);
    const trackedRun = activeRun.finally(() => {
      if (this.#activeRun === trackedRun) {
        this.#activeRun = undefined;
      }
    });
    this.#activeRun = trackedRun;
    return trackedRun;
  }
}
