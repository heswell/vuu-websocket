import { LifecycleEnabled } from "./LifecycleContainer";

export class LifeCycleRunner implements LifecycleEnabled {
  #isRunning = false;
  #intervalId: NodeJS.Timeout | null = null;
  #lifeCycleId: string;

  constructor(
    private name: string,
    private func: () => void,
    private minCycleTime = 100,
  ) {
    this.#lifeCycleId = `lifeCycleRunner-${name}`;
  }

  doStart(): void {
    if (!this.#isRunning) {
      this.#isRunning = true;
      this.run();
    }
  }

  doStop(): void {
    if (this.#isRunning) {
      this.#isRunning = false;
      if (this.#intervalId) {
        clearTimeout(this.#intervalId);
        this.#intervalId = null;
      }
    }
  }

  doInitialize(): void {
    // Initialization logic if needed
  }

  doDestroy(): void {
    this.doStop();
  }

  get lifecycleId() {
    return this.#lifeCycleId;
  }

  private run = () => {
    if (this.#isRunning) {
      this.func();
      this.#intervalId = setTimeout(this.run, this.minCycleTime);
    }
  };
}
