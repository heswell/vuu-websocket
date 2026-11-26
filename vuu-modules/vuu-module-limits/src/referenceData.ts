export type LimitEntityType =
  "Firm" | "Legal entity" | "Desk" | "Book" | "Trader";

export interface LimitEntity {
  entity_id: string;
  entity_type: LimitEntityType;
  name: string;
  /** The entity above this one, blank for the Firm. */
  parent_id: string;
}

/**
 * The entities limits attach to, as a hierarchy: legal entities under the
 * Firm, desks under legal entities, books and traders under desks.
 */
export const LIMIT_ENTITIES: readonly LimitEntity[] = [
  { entity_id: "FIRM", entity_type: "Firm", name: "Firm", parent_id: "" },
  {
    entity_id: "LE-UK",
    entity_type: "Legal entity",
    name: "UK Ltd",
    parent_id: "FIRM",
  },
  {
    entity_id: "LE-US",
    entity_type: "Legal entity",
    name: "US Inc",
    parent_id: "FIRM",
  },
  {
    entity_id: "DESK-EQD",
    entity_type: "Desk",
    name: "Equity derivatives",
    parent_id: "LE-UK",
  },
  {
    entity_id: "DESK-CASH",
    entity_type: "Desk",
    name: "Cash equities",
    parent_id: "LE-UK",
  },
  {
    entity_id: "DESK-RATES",
    entity_type: "Desk",
    name: "Rates",
    parent_id: "LE-US",
  },
  {
    entity_id: "BOOK-EQD-01",
    entity_type: "Book",
    name: "Index options",
    parent_id: "DESK-EQD",
  },
  {
    entity_id: "BOOK-EQD-02",
    entity_type: "Book",
    name: "Single stock options",
    parent_id: "DESK-EQD",
  },
  {
    entity_id: "BOOK-CASH-01",
    entity_type: "Book",
    name: "UK cash",
    parent_id: "DESK-CASH",
  },
  {
    entity_id: "BOOK-RATES-01",
    entity_type: "Book",
    name: "Govt bonds",
    parent_id: "DESK-RATES",
  },
  {
    entity_id: "TRD-JSMITH",
    entity_type: "Trader",
    name: "J Smith",
    parent_id: "DESK-EQD",
  },
  {
    entity_id: "TRD-AKHAN",
    entity_type: "Trader",
    name: "A Khan",
    parent_id: "DESK-CASH",
  },
];

export type LimitPeriod =
  | "Per order"
  | "Per second"
  | "Intraday"
  | "Overnight"
  | "Daily"
  | "MTD"
  | "YTD";

export const LIMIT_PERIODS: readonly LimitPeriod[] = [
  "Per order",
  "Per second",
  "Intraday",
  "Overnight",
  "Daily",
  "MTD",
  "YTD",
];

export type LimitMetricFamily =
  | "Order"
  | "Throughput"
  | "Position"
  | "Sensitivity"
  | "Portfolio risk"
  | "P&L stop-loss"
  | "Credit";

export interface LimitMetric {
  family: LimitMetricFamily;
  periods: readonly LimitPeriod[];
}

const metrics = (
  family: LimitMetricFamily,
  periods: readonly LimitPeriod[],
  names: string[],
): [string, LimitMetric][] => names.map((name) => [name, { family, periods }]);

/** The metrics a limit can be defined on, with the periods each allows. */
export const LIMIT_METRICS: Readonly<Record<string, LimitMetric>> =
  Object.fromEntries([
    ...metrics(
      "Order",
      ["Per order"],
      [
        "Max order quantity",
        "Max order notional",
        "Price collar %",
        "Max % of ADV",
      ],
    ),
    ...metrics(
      "Throughput",
      ["Per second", "Daily"],
      ["Orders per second", "Messages per second", "Order-to-trade ratio"],
    ),
    ...metrics(
      "Position",
      ["Intraday", "Overnight"],
      ["Gross position", "Net position", "Long notional", "Short notional"],
    ),
    ...metrics(
      "Sensitivity",
      ["Intraday", "Overnight"],
      ["Delta", "Gamma", "Vega", "DV01"],
    ),
    ...metrics("Portfolio risk", ["Daily"], ["VaR", "Stress loss"]),
    ...metrics("P&L stop-loss", ["Daily", "MTD", "YTD"], ["Drawdown"]),
    ...metrics("Credit", ["Daily"], ["Counterparty PFE", "Settlement limit"]),
  ]);

export const LIMIT_METRIC_NAMES = Object.keys(LIMIT_METRICS);

export const LIMIT_CURRENCIES = ["USD", "EUR", "GBP", "JPY"] as const;
