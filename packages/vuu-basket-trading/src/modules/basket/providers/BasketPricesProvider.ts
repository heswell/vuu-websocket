import type { Table } from "@heswell/vuu-table";
import { getLogger, Provider } from "@heswell/vuu-server";
import type { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

const log = getLogger("basket.prices");

export type BasketPriceSimulationOptions = {
  /** Zero disables ticking. */
  intervalMs?: number;
  random?: () => number;
};

export class BasketPricesProvider extends Provider {
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly intervalMs: number;
  private readonly random: () => number;

  constructor(
    table: Table,
    private readonly constituentRows: readonly VuuDataRow[],
    { intervalMs = 250, random = Math.random }: BasketPriceSimulationOptions = {},
  ) {
    super(table);
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 0) {
      throw new Error("Basket price intervalMs must be a non-negative integer");
    }
    this.intervalMs = intervalMs;
    this.random = random;
  }

  async doStart() {
    await super.doStart();
    if (this.intervalMs > 0) {
      this.timer = setInterval(() => {
        try {
          this.runOnce();
        } catch (error) {
          this.requestStop();
          log.error("Basket price simulation stopped after a tick failed", error);
        }
      }, this.intervalMs);
    }
  }

  requestStop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  doStop() {
    this.requestStop();
  }

  doDestroy() {
    this.requestStop();
  }

  runOnce() {
    const { columnMap } = this.table;
    for (let index = 0; index < this.table.rows.length; index++) {
      const row = this.table.rows[index].slice();
      const mode = this.random();
      if (mode < 0.1) continue;
      const bid = Number(row[columnMap.bid]);
      const ask = Number(row[columnMap.ask]);
      const fast = mode > 0.8;
      const widening = mode > 0.6 && !fast;
      const movement = (1 + Math.floor(this.random() * (fast ? 10 : 3))) *
        (this.random() < 0.5 ? -1 : 1);
      const midCents = Math.max(2, Math.round((bid + ask) * 50) + movement);
      const spreadCents = widening
        ? Math.min(20, Math.round((ask - bid) * 100) + 2)
        : 2;
      const bidCents = Math.max(1, midCents - Math.floor(spreadCents / 2));
      row[columnMap.bid] = bidCents / 100;
      row[columnMap.ask] = (bidCents + spreadCents) / 100;
      row[columnMap.last] = (bidCents + Math.floor(spreadCents / 2)) / 100;
      row[columnMap.bidSize] = (1 + Math.floor(this.random() * 20)) * 100;
      row[columnMap.askSize] = (1 + Math.floor(this.random() * 20)) * 100;
      row[columnMap.scenario] = widening
        ? "widenBidAndAsk"
        : fast ? "fastTick" : "walkBidAsk";
      this.table.update(index, row);
    }
  }

  async load() {
    const rics = new Set(
      this.constituentRows.map((row) => row[4]).filter((ric) => ric !== ""),
    );
    let index = 0;

    for (const ric of rics) {
      const mid = 50 + (index++ % 100);
      this.table.insert(
        [
          mid + 0.01,
          10_000,
          mid - 0.01,
          10_000,
          mid - 0.25,
          mid,
          mid - 0.1,
          "CONTINUOUS",
          ric,
          "default",
        ],
        false,
      );
    }
  }
}
