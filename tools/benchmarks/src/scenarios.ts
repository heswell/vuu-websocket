import type { VuuAggregation, VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import type { ViewportConfig } from "@heswell/vuu-viewport";
import { COLUMNS, generateUpdates, makeRow, seededRandom } from "./data.ts";
import type { BenchTable, BenchView, EngineAdapter } from "./types.ts";

export interface ScenarioContext {
  adapter: EngineAdapter;
  rows: VuuDataRow[];
}

export interface Scenario<S = unknown> {
  name: string;
  /** untimed */
  setup: (ctx: ScenarioContext) => S;
  /** timed, returns a value used to sanity check engines agree (e.g. size) */
  run: (state: S) => number | string;
  teardown?: (state: S) => void;
}

const WINDOW = { from: 0, to: 50 };
const BATCH = 1000;

const sortByPrice: Partial<ViewportConfig> = {
  sort: { sortDefs: [{ column: "price", sortType: "D" }] },
};
const sortByCcyPrice: Partial<ViewportConfig> = {
  sort: {
    sortDefs: [
      { column: "ccy", sortType: "A" },
      { column: "price", sortType: "D" },
    ],
  },
};
const filterEurHighPrice: Partial<ViewportConfig> = {
  filterSpec: { filter: 'ccy = "EUR" and price > 500' },
};
const filterCcyIn: Partial<ViewportConfig> = {
  filterSpec: { filter: 'ccy in ["EUR","GBP","USD"]' },
};
const aggregations: VuuAggregation[] = [
  { column: "price", aggType: 2 },
  { column: "qty", aggType: 1 },
];
const groupByCcyExchange: Partial<ViewportConfig> = {
  groupBy: ["ccy", "exchange"],
  aggregations,
};

interface ViewState {
  table: BenchTable;
  view: BenchView;
}

interface TickState extends ViewState {
  updates: VuuDataRow[];
}

const createTableAndView = (
  { adapter, rows }: ScenarioContext,
  config: Partial<ViewportConfig>,
): ViewState => {
  const table = adapter.createTable(rows);
  const view = adapter.createView(
    table,
    { columns: COLUMNS, ...config },
    WINDOW,
  );
  view.getCurrentRange();
  return { table, view };
};

const destroyView = ({ view }: ViewState) => view.destroy();

const createViewScenario = (
  name: string,
  config: Partial<ViewportConfig>,
): Scenario<{ table: BenchTable; adapter: EngineAdapter }> => ({
  name,
  setup: ({ adapter, rows }) => ({ adapter, table: adapter.createTable(rows) }),
  run: ({ adapter, table }) => {
    const view = adapter.createView(
      table,
      { columns: COLUMNS, ...config },
      WINDOW,
    );
    view.getCurrentRange();
    const size = view.size;
    view.destroy();
    return size;
  },
});

const changeConfigScenario = (
  name: string,
  initial: Partial<ViewportConfig>,
  change: Partial<ViewportConfig>,
): Scenario<ViewState> => ({
  name,
  setup: (ctx) => createTableAndView(ctx, initial),
  run: ({ view }) => {
    view.setConfig(change);
    return view.size;
  },
  teardown: destroyView,
});

const tickScenario = (
  name: string,
  config: Partial<ViewportConfig>,
  kind: "qty" | "price" | "ccy",
  count: number,
  selectAll = false,
): Scenario<TickState> => ({
  name,
  setup: (ctx) => {
    const state = createTableAndView(ctx, config);
    if (selectAll) state.view.selectAll();
    return { ...state, updates: generateUpdates(ctx.rows, count, kind) };
  },
  run: ({ table, view, updates }) => {
    for (let i = 0; i < updates.length; i++) {
      table.upsert(updates[i]);
      if ((i + 1) % BATCH === 0) view.flush();
    }
    view.flush();
    return view.size;
  },
  teardown: destroyView,
});

export const buildScenarios = (rowCount: number): Scenario<any>[] => {
  // counts are kept modest so that results remain comparable with the
  // committed baselines in results/
  const tickCount = Math.min(rowCount, 20_000);
  const structuralTickCount = Math.min(rowCount / 10, 2_000);
  const insertCount = Math.min(rowCount / 10, 1_000);
  const deleteCount = Math.min(rowCount / 10, 1_000);

  return [
    {
      name: `build table (${rowCount} inserts)`,
      setup: (ctx: ScenarioContext) => ctx,
      run: ({ adapter, rows }: ScenarioContext) =>
        adapter.createTable(rows).rowCount,
    },
    createViewScenario("create view, natural order", {}),
    createViewScenario("create view, sort price", sortByPrice),
    createViewScenario("create view, sort ccy+price", sortByCcyPrice),
    createViewScenario("create view, filter ccy=EUR & price>500", {
      ...filterEurHighPrice,
    }),
    createViewScenario("create view, filter in + sort", {
      ...filterCcyIn,
      ...sortByPrice,
    }),
    changeConfigScenario(
      "re-sort price -> ccy+price",
      sortByPrice,
      sortByCcyPrice,
    ),
    changeConfigScenario(
      "apply filter to sorted view",
      sortByPrice,
      filterCcyIn,
    ),
    changeConfigScenario(
      "narrow filter (in -> in & price>500)",
      { ...sortByPrice, ...filterCcyIn },
      {
        filterSpec: {
          filter: 'ccy in ["EUR","GBP","USD"] and price > 500',
        },
      },
    ),
    {
      name: "scroll 500 x setRange (sorted)",
      setup: (ctx: ScenarioContext) => createTableAndView(ctx, sortByPrice),
      run: ({ view }: ViewState) => {
        let n = 0;
        for (let i = 0; i < 500; i++) {
          const from = i * 20;
          n += view.setRange({ from, to: from + 50 });
        }
        return view.size;
      },
      teardown: destroyView,
    },
    tickScenario(
      `${tickCount} ticks, non-sort column (sorted view)`,
      sortByPrice,
      "qty",
      tickCount,
    ),
    tickScenario(
      `${structuralTickCount} ticks, sort column (sorted view)`,
      sortByPrice,
      "price",
      structuralTickCount,
    ),
    tickScenario(
      `${structuralTickCount} ticks, filter column (filtered+sorted)`,
      { ...filterCcyIn, ...sortByPrice },
      "ccy",
      structuralTickCount,
    ),
    {
      name: `${insertCount} inserts (filtered+sorted)`,
      setup: (ctx: ScenarioContext) => {
        const rnd = seededRandom(99);
        const inserts = Array.from({ length: insertCount }, (_, i) =>
          makeRow(ctx.rows.length + i, rnd),
        );
        return {
          ...createTableAndView(ctx, { ...filterCcyIn, ...sortByPrice }),
          inserts,
        };
      },
      run: ({
        table,
        view,
        inserts,
      }: ViewState & { inserts: VuuDataRow[] }) => {
        for (let i = 0; i < inserts.length; i++) {
          table.insert(inserts[i]);
          if ((i + 1) % BATCH === 0) view.flush();
        }
        view.flush();
        return view.size;
      },
      teardown: destroyView,
    },
    {
      name: `${deleteCount} deletes (sorted)`,
      setup: (ctx: ScenarioContext) => {
        const rnd = seededRandom(7);
        const keys = new Set<string>();
        while (keys.size < deleteCount) {
          keys.add(ctx.rows[Math.floor(rnd() * ctx.rows.length)][0] as string);
        }
        return { ...createTableAndView(ctx, sortByPrice), keys: [...keys] };
      },
      run: ({ table, view, keys }: ViewState & { keys: string[] }) => {
        for (let i = 0; i < keys.length; i++) {
          table.delete(keys[i]);
          if ((i + 1) % BATCH === 0) view.flush();
        }
        view.flush();
        return view.size;
      },
      teardown: destroyView,
    },
    createViewScenario("create view, groupBy ccy,exchange + aggs", {
      ...groupByCcyExchange,
    }),
    changeConfigScenario("groupBy existing view", {}, groupByCcyExchange),
    {
      name: "grouped: expand all ccy nodes",
      setup: (ctx: ScenarioContext) =>
        createTableAndView(ctx, groupByCcyExchange),
      run: ({ view }: ViewState) => {
        for (const ccy of [
          "AUD",
          "CHF",
          "EUR",
          "GBP",
          "JPY",
          "NOK",
          "SEK",
          "USD",
        ]) {
          view.openTreeNode(`$root|${ccy}`);
        }
        return view.size;
      },
      teardown: destroyView,
    },
    tickScenario(
      `${tickCount} ticks, aggregated column (grouped)`,
      groupByCcyExchange,
      "qty",
      tickCount,
    ),
    {
      name: "select all (filtered+sorted)",
      setup: (ctx: ScenarioContext) =>
        createTableAndView(ctx, { ...filterCcyIn, ...sortByPrice }),
      run: ({ view }: ViewState) => {
        view.selectAll();
        return view.selectedRowCount;
      },
      teardown: destroyView,
    },
    {
      name: "selected row keys after select all (filtered+sorted)",
      setup: (ctx: ScenarioContext) => {
        const state = createTableAndView(ctx, {
          ...filterCcyIn,
          ...sortByPrice,
        });
        state.view.selectAll();
        return state;
      },
      run: ({ view }: ViewState) => view.selectedRowKeys(),
      teardown: destroyView,
    },
    tickScenario(
      `${structuralTickCount} ticks, filter column, select all (filtered+sorted)`,
      { ...filterCcyIn, ...sortByPrice },
      "ccy",
      structuralTickCount,
      true,
    ),
  ];
};
