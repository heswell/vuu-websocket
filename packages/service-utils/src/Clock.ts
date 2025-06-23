const systemStartTime = "2025-05-19T09:00:00.000000Z";

class Clock {
  static #instance: Clock;
  public static get instance(): Clock {
    if (!Clock.#instance) {
      Clock.#instance = new Clock();
    }
    return Clock.#instance;
  }

  #baseEpochMillis: number;
  #epochMillisOffset: number;

  private constructor() {
    this.#baseEpochMillis = new Date(systemStartTime).getTime();
    this.#epochMillisOffset = Date.now() - this.#baseEpochMillis;
  }

  get baseTime() {
    return this.#baseEpochMillis;
  }

  get currentTime() {
    return Date.now() - this.#epochMillisOffset;
  }
}

export default Clock.instance;

export const accurateTimer = (fn: Function, time = 1000) => {
  // nextAt is the value for the next time the timer should fire.
  // timeout holds the timeoutID so the timer can be stopped.
  let nextAt: number;
  let timeout: Timer;
  // Initialzes nextAt as now + the time in milliseconds you pass
  // to accurateTimer.
  nextAt = new Date().getTime() + time;

  // This function schedules the next function call.
  const wrapper = () => {
    // The next function call is always calculated from when the
    // timer started.
    nextAt += time;
    // this is where the next setTimeout is adjusted to keep the
    //time accurate.
    timeout = setTimeout(wrapper, nextAt - new Date().getTime());
    // the function passed to accurateTimer is called.
    fn();
  };

  // this function stops the timer.
  const cancel = () => clearTimeout(timeout);

  // the first function call is scheduled.
  timeout = setTimeout(wrapper, nextAt - new Date().getTime());

  // the cancel function is returned so it can be called outside
  // accurateTimer.
  return { cancel };
};
