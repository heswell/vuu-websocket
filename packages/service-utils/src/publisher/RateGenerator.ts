export interface RateGeneratorOptions {
  /** Upper bound for ratePerSecond, start rejects anything higher */
  maxRatePerSecond?: number;
  name: string;
  now?: () => number;
  /** Rate used when start is invoked without an explicit rate */
  ratePerSecond?: number;
  /**
   * Query parameter accepted by the admin start route in addition to
   * `rate`, preserves legacy urls e.g. /admin/start?updatesPerSecond=100
   */
  rateParam?: string;
  /** How often generate is invoked while running */
  tickInterval?: number;
}

export interface RateGeneratorStatus {
  generated: number;
  name: string;
  ratePerSecond: number;
  running: boolean;
}

/**
 * Base class for data generators that produce events at a configured rate.
 * Subclasses implement generate(count). The number of events due on each
 * tick is derived from the elapsed time, carrying fractional events over,
 * so the achieved rate is accurate for any rate and is not affected by
 * timer drift.
 */
export abstract class RateGenerator {
  readonly name: string;
  readonly rateParam: string | undefined;

  #carry = 0;
  #generated = 0;
  #lastTick = 0;
  #maxRatePerSecond: number;
  #now: () => number;
  #ratePerSecond: number;
  #tickInterval: number;
  #timer: Timer | undefined;

  constructor({
    maxRatePerSecond = 100_000,
    name,
    now = () => performance.now(),
    ratePerSecond = 1,
    rateParam,
    tickInterval = 50,
  }: RateGeneratorOptions) {
    this.name = name;
    this.rateParam = rateParam;
    this.#maxRatePerSecond = maxRatePerSecond;
    this.#now = now;
    this.#ratePerSecond = ratePerSecond;
    this.#tickInterval = tickInterval;
  }

  /**
   * Produce up to `count` events. Return the number actually produced if
   * that differs from count, e.g. because a limit has been reached.
   */
  protected abstract generate(count: number): number | void;

  get running() {
    return this.#timer !== undefined;
  }

  get ratePerSecond() {
    return this.#ratePerSecond;
  }

  get status(): RateGeneratorStatus {
    return {
      generated: this.#generated,
      name: this.name,
      ratePerSecond: this.#ratePerSecond,
      running: this.running,
    };
  }

  /**
   * Start generating, or change the rate if already running.
   */
  start(ratePerSecond = this.#ratePerSecond) {
    if (
      !Number.isFinite(ratePerSecond) ||
      ratePerSecond < 0 ||
      ratePerSecond > this.#maxRatePerSecond
    ) {
      throw Error(
        `[${this.name}] rate must be between 0 and ${this.#maxRatePerSecond} per second, received ${ratePerSecond}`,
      );
    }
    this.#ratePerSecond = ratePerSecond;
    if (this.#timer === undefined) {
      this.#carry = 0;
      this.#lastTick = this.#now();
      this.#timer = setInterval(() => this.tick(), this.#tickInterval);
    }
  }

  stop() {
    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
  }

  /**
   * Invoked by the internal timer, exposed for deterministic testing.
   */
  tick(now = this.#now()) {
    const elapsed = now - this.#lastTick;
    this.#lastTick = now;
    if (elapsed <= 0) {
      return;
    }
    const rate = this.#ratePerSecond;
    // never try to catch up more than one second's worth after a stall
    const due = Math.min(rate, (rate * elapsed) / 1000 + this.#carry);
    const count = Math.floor(due);
    this.#carry = due - count;
    if (count > 0) {
      const produced = this.generate(count);
      this.#generated += typeof produced === "number" ? produced : count;
    }
  }
}
