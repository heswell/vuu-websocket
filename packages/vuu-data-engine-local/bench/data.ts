/**
 * Deterministic order data shared by the benches, so every run (and both
 * implementations in the legacy comparison) sees identical rows.
 */
import type { TableSchema } from "@vuu-ui/vuu-data-types";
import type { VuuAggregation } from "@vuu-ui/vuu-protocol-types";

export const schema: TableSchema = {
  columns: [
    { name: "id", serverDataType: "string" },
    { name: "ccy", serverDataType: "string" },
    { name: "exchange", serverDataType: "string" },
    { name: "side", serverDataType: "string" },
    { name: "trader", serverDataType: "string" },
    { name: "price", serverDataType: "double" },
    { name: "qty", serverDataType: "int" },
    { name: "filled", serverDataType: "int" },
    { name: "created", serverDataType: "long" },
  ],
  key: "id",
  table: { module: "BENCH", table: "orders" },
};

export const CCY = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "SEK"];
export const EXCHANGE = ["XLON", "XNYS", "XPAR", "XETR", "XAMS", "XTKS"];
const SIDE = ["BUY", "SELL"];
const TRADER = Array.from({ length: 40 }, (_, i) => `trader${i}`);

/** Aggregations used by the aggregation scenarios: sum, avg, high, count. */
export const AGGREGATIONS: VuuAggregation[] = [
  { column: "qty", aggType: 1 },
  { column: "price", aggType: 2 },
  { column: "filled", aggType: 4 },
  { column: "trader", aggType: 3 },
];

/** A second aggregation set (sum, low), to switch between. */
export const ALTERNATE_AGGREGATIONS: VuuAggregation[] = [
  { column: "filled", aggType: 1 },
  { column: "price", aggType: 5 },
];

// deterministic PRNG (mulberry32)
export const createRandom =
  (seed = 42) =>
  () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

export type Row = [
  string,
  string,
  string,
  string,
  string,
  number,
  number,
  number,
  number,
];

export const createRow = (id: number, random: () => number): Row => [
  `id-${id}`,
  CCY[Math.floor(random() * CCY.length)],
  EXCHANGE[Math.floor(random() * EXCHANGE.length)],
  SIDE[Math.floor(random() * SIDE.length)],
  TRADER[Math.floor(random() * TRADER.length)],
  Math.round(random() * 100_000) / 100,
  Math.floor(random() * 10_000),
  Math.floor(random() * 10_000),
  1_700_000_000_000 + id,
];

export const createData = (count: number) => {
  const random = createRandom();
  return Array.from({ length: count }, (_, i) => createRow(i, random));
};

/** Tree key of a group row, as the engine builds them. */
export const groupKey = (...values: string[]) => `$root|${values.join("|")}`;
