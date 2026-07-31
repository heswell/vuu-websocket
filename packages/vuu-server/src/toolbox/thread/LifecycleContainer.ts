// Scala lifecycle callbacks are synchronous; TypeScript callbacks may return a
// promise so dependency readiness and reverse teardown remain fully ordered.
export type LifecycleCallbackResult = void | Promise<void>;

export interface LifecycleEnabled {
  doStart(): LifecycleCallbackResult;
  doStop(): LifecycleCallbackResult;
  doInitialize(): LifecycleCallbackResult;
  doDestroy(): LifecycleCallbackResult;
  readonly lifecycleId: string;
}

export abstract class DefaultLifecycleEnabled implements LifecycleEnabled {
  readonly lifecycleId: string = "";

  doInitialize(): LifecycleCallbackResult {}

  doStart(): LifecycleCallbackResult {}

  doStop(): LifecycleCallbackResult {}

  doDestroy(): LifecycleCallbackResult {}
}

type ComponentState =
  | "registered"
  | "initializing"
  | "initialized"
  | "starting"
  | "started"
  | "stopped"
  | "destroyed";

type ComponentRegistration = {
  component: LifecycleEnabled;
  dependencies: Set<LifecycleEnabled>;
  order: number;
  state: ComponentState;
};

type LifecycleContainerState =
  | "idle"
  | "starting"
  | "started"
  | "stopping"
  | "stopped"
  | "destroying"
  | "destroyed";

type NodeSignal = "SIGINT" | "SIGTERM";

class LifecycleStartupCancelledError extends Error {
  constructor(cause: unknown) {
    super("[LifecycleContainer] startup cancelled", { cause });
  }
}

export class LifeCycleComponentContext {
  constructor(
    private readonly lifecycle: LifecycleContainer,
    readonly component: LifecycleEnabled,
  ) {}

  dependsOn(...dependencies: LifecycleEnabled[]) {
    this.lifecycle.dependsOn(this.component, ...dependencies);
    return this;
  }
}

export class LifecycleContainer {
  readonly #components = new Map<
    LifecycleEnabled,
    ComponentRegistration
  >();
  #state: LifecycleContainerState = "idle";
  #transition: Promise<void> | undefined;
  #startupOrder: ComponentRegistration[] | undefined;
  #shutdownPromise: Promise<void> | undefined;
  #shutdownHooks = new Map<NodeSignal, () => void>();
  #startupCancellationRequested = false;
  #startupCancellation: Promise<void> | undefined;

  apply(component: LifecycleEnabled) {
    if (this.#state !== "idle") {
      throw new Error(
        `[LifecycleContainer] cannot register ${component.lifecycleId} after startup has begun`,
      );
    }

    if (!this.#components.has(component)) {
      this.#components.set(component, {
        component,
        dependencies: new Set(),
        order: this.#components.size,
        state: "registered",
      });
    }

    return new LifeCycleComponentContext(this, component);
  }

  dependsOn(
    component: LifecycleEnabled,
    ...dependencies: LifecycleEnabled[]
  ) {
    const registration = this.registered(component);
    for (const dependency of dependencies) {
      this.apply(dependency);
      registration.dependencies.add(dependency);
    }
    return new LifeCycleComponentContext(this, component);
  }

  start(): Promise<void> {
    if (this.#state === "started") {
      return Promise.resolve();
    }
    if (this.#state === "starting" && this.#transition) {
      return this.#transition;
    }
    if (this.#state !== "idle") {
      return Promise.reject(
        new Error(
          `[LifecycleContainer] cannot start lifecycle in state ${this.#state}`,
        ),
      );
    }

    this.#state = "starting";
    this.#transition = this.startComponents();
    return this.#transition;
  }

  stop(): Promise<void> {
    if (
      this.#state === "idle" ||
      this.#state === "stopped" ||
      this.#state === "destroyed"
    ) {
      return Promise.resolve();
    }
    if (
      (this.#state === "stopping" || this.#state === "destroying") &&
      this.#transition
    ) {
      return this.#transition;
    }
    if (this.#state === "starting" && this.#transition) {
      return this.#transition.then(
        () => this.stop(),
        () => undefined,
      );
    }

    this.#state = "stopping";
    this.#transition = this.stopComponents();
    return this.#transition;
  }

  destroy(): Promise<void> {
    if (this.#state === "destroyed") {
      return Promise.resolve();
    }
    if (this.#state === "destroying" && this.#transition) {
      return this.#transition;
    }
    if (this.#state === "stopping" && this.#transition) {
      return this.#transition.then(
        () => this.destroy(),
        () => this.destroy(),
      );
    }
    if (this.#state === "starting" && this.#transition) {
      this.#startupCancellationRequested = true;
      this.#startupCancellation ??= this.stopStartingComponents();
      const startup = this.#transition;
      return Promise.allSettled([startup, this.#startupCancellation]).then(
        async ([startupResult, cancellationResult]) => {
          const errors: unknown[] = [];
          try {
            await this.destroy();
          } catch (error: unknown) {
            errors.push(error);
          }
          if (
            startupResult.status === "rejected" &&
            !(startupResult.reason instanceof LifecycleStartupCancelledError)
          ) {
            errors.push(startupResult.reason);
          }
          if (cancellationResult.status === "rejected") {
            errors.push(cancellationResult.reason);
          }
          this.throwCleanupErrors("destroy", errors);
        },
      );
    }

    this.#state = "destroying";
    this.#transition = this.destroyComponents();
    return this.#transition;
  }

  shutdown() {
    if (!this.#shutdownPromise) {
      this.#shutdownPromise = this.destroy().finally(() => {
        this.removeShutdownHooks();
      });
    }
    return this.#shutdownPromise;
  }

  installShutdownHooks(signals: readonly NodeSignal[] = [
    "SIGINT",
    "SIGTERM",
  ]) {
    for (const signal of signals) {
      if (this.#shutdownHooks.has(signal)) {
        continue;
      }
      const hook = () => {
        void this.shutdown()
          .then(() => {
            process.exitCode = signal === "SIGINT" ? 130 : 143;
          })
          .catch((error: unknown) => {
            console.error(
              `[LifecycleContainer] shutdown failed after ${signal}`,
              error,
            );
            process.exitCode = 1;
          });
      };
      this.#shutdownHooks.set(signal, hook);
      process.once(signal, hook);
    }
    return () => this.removeShutdownHooks();
  }

  autoShutdownHook() {
    this.installShutdownHooks();
  }

  removeShutdownHooks() {
    for (const [signal, hook] of this.#shutdownHooks) {
      process.removeListener(signal, hook);
    }
    this.#shutdownHooks.clear();
  }

  private registered(component: LifecycleEnabled) {
    this.apply(component);
    const registration = this.#components.get(component);
    if (!registration) {
      throw new Error(
        `[LifecycleContainer] failed to register ${component.lifecycleId}`,
      );
    }
    return registration;
  }

  private orderedComponents() {
    const result: ComponentRegistration[] = [];
    const visiting = new Set<LifecycleEnabled>();
    const visited = new Set<LifecycleEnabled>();
    const path: LifecycleEnabled[] = [];
    const registrations = [...this.#components.values()].sort(
      (left, right) => left.order - right.order,
    );

    const visit = (registration: ComponentRegistration) => {
      const { component } = registration;
      if (visited.has(component)) {
        return;
      }
      if (visiting.has(component)) {
        const cycleStart = path.indexOf(component);
        const cycle = path
          .slice(cycleStart)
          .concat(component)
          .map(({ lifecycleId }) => lifecycleId)
          .join(" -> ");
        throw new Error(`[LifecycleContainer] dependency cycle: ${cycle}`);
      }

      visiting.add(component);
      path.push(component);
      const dependencies = [...registration.dependencies]
        .map((dependency) => this.#components.get(dependency))
        .filter(
          (dependency): dependency is ComponentRegistration =>
            dependency !== undefined,
        )
        .sort((left, right) => left.order - right.order);
      for (const dependency of dependencies) {
        visit(dependency);
      }
      path.pop();
      visiting.delete(component);
      visited.add(component);
      result.push(registration);
    };

    for (const registration of registrations) {
      visit(registration);
    }
    return result;
  }

  private async startComponents() {
    let ordered: ComponentRegistration[] = [];
    try {
      ordered = this.orderedComponents();
      this.#startupOrder = ordered;
      for (const registration of ordered) {
        registration.state = "initializing";
        await registration.component.doInitialize();
        registration.state = "initialized";
      }
      for (const registration of ordered) {
        registration.state = "starting";
        await registration.component.doStart();
        if (this.#startupCancellationRequested) {
          await this.#startupCancellation;
          throw new LifecycleStartupCancelledError(undefined);
        }
        registration.state = "started";
      }
      this.#state = "started";
    } catch (startError: unknown) {
      const rollbackErrors = await this.rollback(ordered);
      this.#state = "stopped";
      if (rollbackErrors.length > 0) {
        throw new AggregateError(
          [startError, ...rollbackErrors],
          "[LifecycleContainer] startup and rollback failed",
        );
      }
      if (this.#startupCancellationRequested) {
        throw new LifecycleStartupCancelledError(startError);
      }
      throw startError;
    } finally {
      this.#transition = undefined;
    }
  }

  private async rollback(ordered: ComponentRegistration[]) {
    const errors: unknown[] = [];
    for (const registration of ordered.toReversed()) {
      if (
        registration.state === "starting" ||
        registration.state === "started"
      ) {
        await this.invokeForCleanup(
          registration,
          "doStop",
          "stopped",
          errors,
        );
      }
    }
    for (const registration of ordered.toReversed()) {
      if (
        registration.state === "initializing" ||
        registration.state === "initialized" ||
        registration.state === "stopped"
      ) {
        await this.invokeForCleanup(
          registration,
          "doDestroy",
          "destroyed",
          errors,
        );
      }
    }
    return errors;
  }

  private async stopComponents() {
    const errors: unknown[] = [];
    for (const registration of this.teardownOrder()) {
      if (registration.state === "started") {
        await this.invokeForCleanup(
          registration,
          "doStop",
          "stopped",
          errors,
        );
      }
    }
    this.#state = "stopped";
    this.#transition = undefined;
    this.throwCleanupErrors("stop", errors);
  }

  private async stopStartingComponents() {
    const errors: unknown[] = [];
    for (const registration of this.teardownOrder()) {
      if (
        registration.state === "starting" ||
        registration.state === "started"
      ) {
        await this.invokeForCleanup(
          registration,
          "doStop",
          "stopped",
          errors,
        );
      }
    }
    this.throwCleanupErrors("stop", errors);
  }

  private async destroyComponents() {
    const errors: unknown[] = [];
    for (const registration of this.teardownOrder()) {
      if (registration.state === "started") {
        await this.invokeForCleanup(
          registration,
          "doStop",
          "stopped",
          errors,
        );
      }
    }
    for (const registration of this.teardownOrder()) {
      if (
        registration.state === "initialized" ||
        registration.state === "stopped"
      ) {
        await this.invokeForCleanup(
          registration,
          "doDestroy",
          "destroyed",
          errors,
        );
      }
    }
    this.#state = "destroyed";
    this.#transition = undefined;
    this.throwCleanupErrors("destroy", errors);
  }

  private async invokeForCleanup(
    registration: ComponentRegistration,
    method: "doStop" | "doDestroy",
    nextState: ComponentState,
    errors: unknown[],
  ) {
    try {
      await registration.component[method]();
    } catch (error: unknown) {
      errors.push(error);
    } finally {
      registration.state = nextState;
    }
  }

  private teardownOrder() {
    const ordered =
      this.#startupOrder ??
      [...this.#components.values()].sort(
        (left, right) => left.order - right.order,
      );
    return ordered.toReversed();
  }

  private throwCleanupErrors(action: "stop" | "destroy", errors: unknown[]) {
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(
        errors,
        `[LifecycleContainer] ${action} failed`,
      );
    }
  }
}
