/**
 * One entry per JMH benchmark in finos/vuu benchmark/, reproduced against
 * @heswell/vuu-table and @heswell/vuu-viewport. Sizes and setup levels
 * mirror the JMH @Param and @Setup(Level.*) annotations, including where the
 * Scala benchmark reuses one table across invocations.
 */
import type { Table } from "@heswell/vuu-table";
import { InMemoryViewport, type ViewportConfig } from "@heswell/vuu-viewport";
import { BenchmarkHelper, Blackhole } from "./data.ts";

export type ParamName = "tableSize" | "insertSize";

export interface ParityBenchmark<S = any> {
  /** JMH benchmark name, relative to package org.finos.vuu.benchmark */
  name: string;
  param: ParamName;
  /** JMH @Param values */
  sizes: number[];
  /**
   * Largest size to run on the Scala side by default, where the JMH
   * benchmark itself is too slow to run at every size.
   */
  scalaMaxSize?: number;
  /** @Setup(Level.Trial) */
  trial: (size: number) => S;
  /** @Setup(Level.Iteration) */
  iteration?: (state: S, size: number) => void;
  /** @Setup(Level.Invocation), untimed */
  invocation?: (state: S, size: number) => void;
  /** the timed operation */
  run: (state: S, size: number) => void;
  /** untimed cleanup after each invocation */
  after?: (state: S) => void;
  /** what each side measures */
  scala: string;
  vuu: string;
  /** caveat shown in the report */
  scalaNote?: string;
}

const RANGE = { from: 0, to: 50 };

interface ViewState {
  helper: BenchmarkHelper;
  table: Table;
  columns: string[];
  vp?: InMemoryViewport;
}

const priceTableState = (size: number): ViewState => {
  const helper = new BenchmarkHelper();
  helper.addPriceTableData(size);
  return {
    helper,
    table: helper.prices,
    columns: helper.prices.columns.map((c) => c.name),
  };
};

/**
 * Equivalent of a CREATE_VP: full filter, sort and (lazy) group build of the
 * table, plus projection of the first window of rows.
 */
const createViewport = (state: ViewState, config: Partial<ViewportConfig>) => {
  state.vp = new InMemoryViewport(state.table, {
    id: "bench",
    columns: state.columns,
    range: RANGE,
    ...config,
  });
  state.vp.getCurrentRange();
};

const destroyViewport = (state: ViewState) => {
  state.vp?.destroy();
  state.vp = undefined;
};

const viewportBenchmark = (
  name: string,
  sizes: number[],
  config: (size: number) => Partial<ViewportConfig>,
  scala: string,
  vuu: string,
): ParityBenchmark<ViewState> => ({
  name,
  param: "tableSize",
  sizes,
  trial: priceTableState,
  run: (state, size) => createViewport(state, config(size)),
  after: destroyViewport,
  scala,
  vuu,
});

interface TableState {
  helper: BenchmarkHelper;
  bh: Blackhole;
}

const pullAllRows = (table: Table, bh: Blackhole) => {
  for (const key of table.keys) {
    bh.consume(table.getRowAtKey(key, false));
  }
};

const VP_NOTE =
  "InMemoryViewport created over the table (filter, sort, group build and first 50 row window), as for CREATE_VP.";

export const benchmarks: ParityBenchmark[] = [
  viewportBenchmark(
    "sort.SortBenchmarkRunner.sortLargeTableSingle",
    [10_000, 100_000, 1_000_000],
    () => ({ sort: { sortDefs: [{ column: "exchange", sortType: "A" }] } }),
    "Sort.doSort of all primary keys by exchange (unique strings) ascending.",
    VP_NOTE,
  ),
  viewportBenchmark(
    "sort.SortBenchmarkRunner.sortLargeTableMulti",
    [10_000, 100_000, 1_000_000],
    () => ({
      sort: {
        sortDefs: [
          { column: "exchange", sortType: "D" },
          { column: "close", sortType: "A" },
        ],
      },
    }),
    "Sort.doSort of all primary keys by exchange descending, close ascending.",
    VP_NOTE,
  ),
  viewportBenchmark(
    "filter.FilterBenchmarkRunner.equalsFilter",
    [1_000_000],
    (size) => ({
      filterSpec: { filter: `exchange = "exchange-${size - 1}"` },
    }),
    "EqualsClause.filterAllSafe on exchange, which is an indexed column (indexFields), so this is an index lookup.",
    `${VP_NOTE} No column indexes, so a full scan.`,
  ),
  viewportBenchmark(
    "filter.FilterBenchmarkRunner.startsWithFilter",
    [1_000_000],
    () => ({ filterSpec: { filter: 'exchange starts "exchange-1"' } }),
    "StartsClause.filterAllSafe on exchange.",
    VP_NOTE,
  ),
  viewportBenchmark(
    "filter.FilterBenchmarkRunner.lessThanFilter",
    [1_000_000],
    (size) => ({ filterSpec: { filter: `close < ${size / 2}` } }),
    "LessThanClause.filterAllSafe on close.",
    VP_NOTE,
  ),
  viewportBenchmark(
    "tree.TreeBenchmarkRunner.treeLargeTable",
    [10_000, 100_000, 500_000, 1_000_000],
    () => ({ groupBy: ["exchange"] }),
    "TreeBuilder.buildEntireTree, group by exchange (one group per row), no aggregations, all nodes collapsed.",
    VP_NOTE,
  ),
  {
    name: "join.JoinTableBenchmarkRunner.iterateRows",
    param: "insertSize",
    sizes: [10_000, 100_000, 1_000_000],
    trial: (size): TableState => {
      const helper = new BenchmarkHelper();
      helper.addCurrencyTableData();
      helper.addPriceTableData(10);
      helper.addOrderTableData(size);
      return { helper, bh: new Blackhole() };
    },
    run: ({ helper, bh }) => pullAllRows(helper.orderPricesCurrencies, bh),
    scala:
      "pullRow for every key of orderPricesCurrencies (orders join pricesCurrencies join currencies). Join rows are assembled on read.",
    vuu: "getRowAtKey for every key of the JoinTable. Join rows are materialized, so this is a key lookup.",
  },
  {
    name: "table.InMemDataTableBenchmarkRunner.iterateRows",
    param: "insertSize",
    sizes: [50_000, 250_000, 500_000],
    // The JMH loop is `for (i = 0; i < keys.size(); i++)`. TablePrimaryKeys
    // is a Scala Iterable that does not override size, so every keys.size()
    // call walks all keys and the loop is O(n^2): about 190 s per op at 500k.
    scalaMaxSize: 50_000,
    trial: (): TableState => ({
      helper: new BenchmarkHelper(),
      bh: new Blackhole(),
    }),
    iteration: ({ helper }, size) => helper.addPriceTableData(size),
    run: ({ helper, bh }) => pullAllRows(helper.prices, bh),
    scala: "pullRow for every primary key of prices.",
    vuu: "getRowAtKey for every key of prices.",
    scalaNote:
      "the JMH loop calls keys.size() on every iteration and TablePrimaryKeys (a Scala Iterable) computes size by walking every key, so the Scala time is O(n^2) and mostly benchmark overhead. Only sizes up to 50,000 are run on the Scala side.",
  },
  {
    name: "table.InMemDataTableBenchmarkRunner.updateRows",
    param: "insertSize",
    sizes: [50_000, 250_000, 500_000],
    trial: (): TableState => ({
      helper: new BenchmarkHelper(),
      bh: new Blackhole(),
    }),
    iteration: ({ helper }, size) => helper.addPriceTableData(size),
    run: ({ helper }) => {
      const table = helper.prices;
      for (const key of table.keys) {
        table.upsert(table.getRowAtKey(key).slice());
      }
    },
    scala:
      "pullRow then processUpdate of the same row for every key, running the join provider every 16384 rows.",
    vuu: "Copy of each row upserted, join tables updated synchronously.",
  },
  {
    name: "table.InMemDataTableEmptyBenchmarkRunner.addRows",
    param: "insertSize",
    sizes: [50_000, 250_000, 500_000],
    // The JMH state (and so the table) is shared by every invocation; only
    // the first invocation inserts, later invocations update the same keys.
    trial: (): TableState => ({
      helper: new BenchmarkHelper(),
      bh: new Blackhole(),
    }),
    run: ({ helper }, size) => helper.addPriceTableData(size),
    scala:
      "Build and processUpdate N price rows. The table persists across invocations, so after the first invocation these are updates of existing keys.",
    vuu: "Build and upsert N price rows into the same persistent table.",
  },
  {
    name: "table.InMemDataTableRemovalBenchmarkRunner.removeRows",
    param: "insertSize",
    sizes: [5_000, 50_000, 100_000],
    trial: (): TableState => ({
      helper: new BenchmarkHelper(),
      bh: new Blackhole(),
    }),
    invocation: ({ helper }, size) => helper.addPriceTableData(size),
    run: ({ helper }, size) => {
      const table = helper.prices;
      let i = 0;
      for (const key of table.keys) {
        if (i++ >= size) break;
        table.delete(key);
      }
    },
    scala:
      "processDelete of N keys (untimed re-insert before each invocation), running the join provider every 16384 rows.",
    vuu: "delete of N keys (untimed re-insert before each invocation), join tables updated synchronously.",
    scalaNote:
      "Scala removes each key from the primary key array with a linear indexOf, so deletes are O(n) each and the benchmark is O(n^2) on that side.",
  },
];
