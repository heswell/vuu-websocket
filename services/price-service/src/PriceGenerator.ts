import { random, RateGenerator, type RateGeneratorOptions } from "@heswell/service-utils";
import type { Table, TableListener } from "@heswell/vuu-table";
import type { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

export const scenarios = ["fastTick", "widenBidAndAsk", "walkBidAsk"];

const MIN_SIZE = 100;
const MAX_SIZE = 1_000_000;

// column positions, see pricesSchema
const ASK = 0;
const ASK_SIZE = 1;
const BID = 2;
const BID_SIZE = 3;
const LAST = 5;

const randomPriceChange = () =>
  (random(1, 4) / 1000) * (Math.random() < 0.5 ? 1 : -1);

const nextSize = (size: number) =>
  Math.min(
    MAX_SIZE,
    Math.max(MIN_SIZE, Math.round(size * (0.9 + Math.random() * 0.2))),
  );

export const createPrice = (ric: string): VuuDataRow => {
  const mid = random(11, 1499) / 10;
  const spread = random(1, 5) / 1000;
  return [
    mid + spread / 2, // ask
    random(1000, 100_000), // askSize
    mid - spread / 2, // bid
    random(1000, 100_000), // bidSize
    0, // close
    0, // last
    0, // open
    "C", // phase
    ric,
    scenarios[random(0, scenarios.length - 1)],
  ];
};

export const updatePrice = (price: VuuDataRow): VuuDataRow => {
  const updated = price.slice();
  let change = randomPriceChange();
  if ((updated[BID] as number) + change <= 0) {
    change = Math.abs(change);
  }
  updated[ASK] = (updated[ASK] as number) + change;
  updated[BID] = (updated[BID] as number) + change;
  updated[ASK_SIZE] = nextSize(updated[ASK_SIZE] as number);
  updated[BID_SIZE] = nextSize(updated[BID_SIZE] as number);
  updated[LAST] = (updated[LAST] as number) + 1;
  return updated;
};

export interface PriceGeneratorOptions
  extends Omit<RateGeneratorOptions, "name" | "rateParam"> {
  instruments: Table;
  prices: Table;
}

/**
 * Maintains a price for every instrument and generates random price ticks.
 * Prices are created/removed as instruments are added/removed, so the
 * generator tracks reference data as it changes, including reconciliation
 * after the reference data service restarts.
 */
export class PriceGenerator extends RateGenerator {
  readonly instruments: Table;
  readonly prices: Table;
  #instrumentListener: TableListener;

  constructor({ instruments, prices, ...options }: PriceGeneratorOptions) {
    super({ name: "prices", rateParam: "updatesPerSecond", ...options });
    this.instruments = instruments;
    this.prices = prices;
    const ricIdx = instruments.columnMap.ric;
    const addPrice = (row: VuuDataRow) => {
      const ric = row[ricIdx] as string;
      if (!prices.hasKey(ric)) {
        prices.insert(createPrice(ric));
      }
    };
    this.#instrumentListener = {
      onInsert: (_idx, row) => addPrice(row),
      onDelete: (_idx, row) => {
        prices.delete(row[ricIdx] as string);
      },
      onClear: () => prices.clear(),
    };
    for (const row of instruments.rows) {
      addPrice(row);
    }
    instruments.addListener(this.#instrumentListener);
  }

  protected generate(count: number) {
    const { prices } = this;
    const rowCount = prices.rowCount;
    if (rowCount === 0) {
      return 0;
    }
    const { rows } = prices;
    for (let i = 0; i < count; i++) {
      const rowIdx = random(0, rowCount - 1);
      prices.update(rowIdx, updatePrice(rows[rowIdx]));
    }
    return count;
  }

  dispose() {
    this.stop();
    this.instruments.removeListener(this.#instrumentListener);
  }
}
