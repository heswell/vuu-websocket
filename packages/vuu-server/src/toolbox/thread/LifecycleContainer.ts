export interface LifecycleEnabled {
  doStart(): void;
  doStop(): void;
  doInitialize(): void;
  doDestroy(): void;
  lifecycleId: string;
}

export class LifecycleContainer {
  // TODO add dependency management if we need it
  #lifeCycleRunners: LifecycleEnabled[] = [];
  apply(comp: LifecycleEnabled) {
    console.log(`apply comp ${comp.lifecycleId}`);
    this.#lifeCycleRunners.push(comp);
  }
  start() {
    console.log(`[LifecycleContainer] start`);
    this.#lifeCycleRunners.forEach((runner) => {
      console.log(`[LifecycleContainer] initialize ${runner.lifecycleId}`);
      runner.doInitialize();
    });

    this.#lifeCycleRunners.forEach((runner) => {
      console.log(`[LifecycleContainer] start ${runner.lifecycleId}`);
      runner.doStart();
    });
  }
}
