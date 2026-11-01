import type { TableSchema } from "@vuu-ui/vuu-data-types";
import type { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

export const schema: TableSchema = {
  table: { module: "BENCH", table: "orders" },
  key: "id",
  columns: [
    { name: "id", serverDataType: "string" },
    { name: "ric", serverDataType: "string" },
    { name: "ccy", serverDataType: "string" },
    { name: "exchange", serverDataType: "string" },
    { name: "sector", serverDataType: "string" },
    { name: "side", serverDataType: "string" },
    { name: "price", serverDataType: "double" },
    { name: "qty", serverDataType: "int" },
    { name: "filled", serverDataType: "int" },
  ],
};

export const COLUMNS = schema.columns.map((c) => c.name);

const CCY = ["EUR", "GBP", "USD", "JPY", "CHF", "SEK", "NOK", "AUD"];
const EXCHANGE = ["XLON", "XNYS", "XPAR", "XAMS", "XETR", "XNAS"];
const SECTORS = Array.from({ length: 20 }, (_, i) => `Sector-${i}`);
const SIDES = ["BUY", "SELL"];

export const seededRandom = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const pick = <T>(rnd: () => number, values: T[]) =>
  values[Math.floor(rnd() * values.length)];

export const makeRow = (i: number, rnd: () => number): VuuDataRow => [
  `ord-${i}`,
  `RIC${Math.floor(rnd() * 5000)}.L`,
  pick(rnd, CCY),
  pick(rnd, EXCHANGE),
  pick(rnd, SECTORS),
  pick(rnd, SIDES),
  Math.round(rnd() * 100000) / 100,
  Math.floor(rnd() * 10000),
  0,
];

export const generateRows = (count: number, seed = 1) => {
  const rnd = seededRandom(seed);
  const rows: VuuDataRow[] = new Array(count);
  for (let i = 0; i < count; i++) rows[i] = makeRow(i, rnd);
  return rows;
};

export type UpdateKind = "qty" | "price" | "ccy";

/** Generate replacement rows (new arrays) for random existing keys */
export const generateUpdates = (
  rows: VuuDataRow[],
  count: number,
  kind: UpdateKind,
  seed = 2,
) => {
  const rnd = seededRandom(seed);
  const updates: VuuDataRow[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const row = rows[Math.floor(rnd() * rows.length)].slice();
    if (kind === "qty") row[7] = Math.floor(rnd() * 10000);
    else if (kind === "price") row[6] = Math.round(rnd() * 100000) / 100;
    else row[2] = pick(rnd, CCY);
    updates[i] = row;
  }
  return updates;
};
