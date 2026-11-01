/**
 * Port of finos/vuu benchmark/src/main/java/org/finos/vuu/benchmark
 * TableDefs.java and BenchmarkHelper.java, so that the JMH benchmarks of the
 * Scala engine can be reproduced against @heswell/vuu-table and
 * @heswell/vuu-viewport with identical tables and data.
 */
import { JoinTable, Table } from "@heswell/vuu-table";
import type { TableSchema } from "@vuu-ui/vuu-data-types";
import type { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

const MODULE = "BENCHMARK";

// Scala leaves open and vuuMsg null; the protocol row type has no null.
const NULL = null as unknown as VuuDataRow[number];

// Scala TableDefs include the default columns
// (DefaultColumn.getDefaultColumns) on every table.
const defaultColumns: TableSchema["columns"] = [
  { name: "vuuCreatedTimestamp", serverDataType: "long" },
  { name: "vuuUpdatedTimestamp", serverDataType: "long" },
  { name: "vuuMsg", serverDataType: "string" },
];

export const CURRENCIES: TableSchema = {
  table: { module: MODULE, table: "currencies" },
  key: "currency",
  columns: [
    { name: "currency", serverDataType: "string" },
    { name: "minorCurrency", serverDataType: "string" },
    ...defaultColumns,
  ],
};

export const PRICES: TableSchema = {
  table: { module: MODULE, table: "prices" },
  key: "ric",
  columns: [
    { name: "ric", serverDataType: "string" },
    { name: "bid", serverDataType: "double" },
    { name: "ask", serverDataType: "double" },
    { name: "last", serverDataType: "double" },
    { name: "open", serverDataType: "double" },
    { name: "close", serverDataType: "double" },
    { name: "exchange", serverDataType: "string" },
    { name: "currency", serverDataType: "string" },
    ...defaultColumns,
  ],
};

export const ORDERS: TableSchema = {
  table: { module: MODULE, table: "orders" },
  key: "orderId",
  columns: [
    { name: "orderId", serverDataType: "string" },
    { name: "trader", serverDataType: "string" },
    { name: "ric", serverDataType: "string" },
    { name: "tradeTime", serverDataType: "long" },
    { name: "quantity", serverDataType: "double" },
    ...defaultColumns,
  ],
};

const isDefault = (name: string) => defaultColumns.some((c) => c.name === name);

/** Columns.allFrom(base) ++ Columns.allFromExceptDefaultAnd(right, except) */
const joinColumns = (
  base: TableSchema,
  right: TableSchema,
  except: string,
): TableSchema["columns"] => [
  ...base.columns,
  ...right.columns.filter((c) => c.name !== except && !isDefault(c.name)),
];

export const PRICES_CURRENCIES: TableSchema = {
  table: { module: MODULE, table: "pricesCurrencies" },
  key: "ric",
  columns: joinColumns(PRICES, CURRENCIES, "currency"),
};

export const ORDER_PRICES_CURRENCIES: TableSchema = {
  table: { module: MODULE, table: "orderPricesCurrencies" },
  key: "orderId",
  columns: joinColumns(ORDERS, PRICES_CURRENCIES, "ric"),
};

/**
 * Equivalent of BenchmarkHelper. All five tables are created up front, as in
 * the Scala helper, so that every table operation pays the same join
 * maintenance cost. The Scala join manager batches join events and applies
 * them on runOnce(); JoinTable applies them synchronously.
 */
export class BenchmarkHelper {
  readonly currencies = new Table(CURRENCIES);
  readonly prices = new Table(PRICES);
  readonly orders = new Table(ORDERS);
  readonly pricesCurrencies = new JoinTable({
    schema: PRICES_CURRENCIES,
    baseTable: this.prices,
    joinTable: this.currencies,
    leftColumn: "currency",
    rightColumn: "currency",
  });
  readonly orderPricesCurrencies = new JoinTable({
    schema: ORDER_PRICES_CURRENCIES,
    baseTable: this.orders,
    joinTable: this.pricesCurrencies,
    leftColumn: "ric",
    rightColumn: "ric",
  });

  addCurrencyTableData() {
    this.currencies.upsert(["GBP", "GBX", 0, 0, NULL]);
  }

  addPriceTableData(size: number) {
    const table = this.prices;
    for (let i = 0; i < size; i++) {
      const ric = "TST-" + i;
      table.upsert([
        ric,
        i + 1.0,
        i + 2.0,
        i + 3.0,
        NULL,
        i + 4.0,
        "exchange-" + i,
        "GBP",
        0,
        0,
        NULL,
      ]);
    }
  }

  addOrderTableData(size: number) {
    const table = this.orders;
    for (let i = 0; i < size; i++) {
      const orderId = String(i);
      table.upsert([
        orderId,
        "trader@firm.com",
        "TST-" + (i % 10),
        Date.now(),
        i,
        0,
        0,
        NULL,
      ]);
    }
  }
}

/** Equivalent of JMH Blackhole.consume, defeats dead code elimination. */
export class Blackhole {
  sink = 0;
  consume(row: VuuDataRow | undefined) {
    this.sink += row === undefined ? 0 : row.length;
  }
}
