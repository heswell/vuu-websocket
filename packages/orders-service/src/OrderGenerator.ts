import {
  getRandom,
  random,
  RateGenerator,
  type RateGeneratorOptions,
} from "@heswell/service-utils";
import type { Table } from "@heswell/vuu-table";
import type { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import { Clock } from "@vuu-ui/vuu-utils";
import type { ParentOrderDto } from "./order-service-types";

const orderStatus: ParentOrderDto["status"][] = [
  "NEW",
  "CANCELLED",
  "PARTIAL",
  "FILLED",
];
const algos = ["DARKLIQ", "IS", "SURESHOT", "VWAP", "LITLIQ", "TWAP"];
const sides = ["BUY", "SELL"];
const accounts = Array.from(
  { length: 20 },
  (_, i) => `Account ${String(i + 1).padStart(2, "0")}`,
);
// column13 .. column40, see parentOrdersSchema
const PADDING_COLUMN_COUNT = 28;

export interface OrderGeneratorOptions
  extends Omit<RateGeneratorOptions, "name" | "rateParam"> {
  instruments: Table;
  maxOrders?: number;
  orders: Table;
}

/**
 * Creates parent orders for random instruments. createInitialOrders seeds
 * the table, the generator then creates NEW orders at the configured rate.
 */
export class OrderGenerator extends RateGenerator {
  readonly instruments: Table;
  readonly orders: Table;

  #clock = new Clock({ year: 2025, month: 4, day: 15, hours: 9 });
  #maxOrders: number;
  #nextId = 0;

  constructor({
    instruments,
    maxOrders = 500_000,
    orders,
    ...options
  }: OrderGeneratorOptions) {
    super({
      name: "orders",
      rateParam: "newOrdersPerSecond",
      maxRatePerSecond: 10_000,
      ...options,
    });
    this.instruments = instruments;
    this.orders = orders;
    this.#maxOrders = maxOrders;
  }

  createOrder(
    created = this.#clock.now,
    status: ParentOrderDto["status"] = getRandom(orderStatus),
  ): VuuDataRow | undefined {
    const { columnMap, rows } = this.instruments;
    if (rows.length === 0) {
      return undefined;
    }
    const instrument = getRandom(rows);
    this.#nextId += 1;
    const quantity = 1000 * random(1, 100);
    const filledQuantity =
      status === "FILLED"
        ? quantity
        : status === "NEW"
          ? 0
          : quantity - random(100, quantity);

    const row: VuuDataRow = [
      String(this.#nextId).padStart(8, "0"),
      getRandom(sides),
      status,
      instrument[columnMap.ric],
      getRandom(algos),
      instrument[columnMap.currency],
      quantity,
      filledQuantity,
      getRandom(accounts),
      "trader joe",
      created,
      created,
    ];
    for (let i = 0; i < PADDING_COLUMN_COUNT; i++) {
      row.push(0);
    }
    this.orders.insert(row);
    return row;
  }

  createInitialOrders(count: number) {
    const start = performance.now();
    let created = 0;
    for (let i = 0; i < count; i++) {
      if (this.createOrder() === undefined) {
        break;
      }
      created += 1;
      this.#clock.advance(random(0, 100));
    }
    return { count: created, ms: Math.round(performance.now() - start) };
  }

  protected generate(count: number) {
    const available = Math.max(0, this.#maxOrders - this.orders.rowCount);
    const toCreate = Math.min(count, available);
    this.#clock.advance(50);
    const created = this.#clock.now;
    let produced = 0;
    for (let i = 0; i < toCreate; i++) {
      if (this.createOrder(created, "NEW")) {
        produced += 1;
      }
    }
    return produced;
  }
}
