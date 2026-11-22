import { LifeCycleRunner, Provider } from "@heswell/vuu-server";
import type { Table } from "@heswell/vuu-table";
import type { LimitsStore } from "./LimitsStore";

/** How often to check whether a new business day has begun. */
const BUSINESS_DAY_CHECK_MS = 60_000;

/**
 * Starts with no limits. Activates Pending limits when a new business day
 * begins.
 */
export class LimitsProvider extends Provider {
  #runner: LifeCycleRunner;
  override readonly lifecycleId: string;

  constructor(table: Table, store: LimitsStore) {
    super(table);
    this.lifecycleId = `limitsProvider-${table.name}`;
    this.#runner = new LifeCycleRunner(
      "limitsBusinessDay",
      () => store.activateOnNewBusinessDay(),
      BUSINESS_DAY_CHECK_MS,
    );
  }

  async load() {
    await this.#runner.doStart();
  }

  async doStop() {
    await this.#runner.doStop();
  }

  requestStop() {
    this.#runner.requestStop();
  }
}
