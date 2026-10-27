/**
 * Engine-only scale benchmark: timings and heap for the engine backed
 * ModuleDataSource at 1M rows (no legacy comparison, which is impractical at
 * this size). Runs under vitest in Node with --expose-gc, see
 * vitest.scale.config.ts.
 *
 *   npm run bench:scale                     1M rows, results printed
 *   SCALE_ROWS=200000 npm run bench:scale   smaller run
 *   SCALE_OUT=/tmp/scale.json npm run bench:scale
 *
 * Each timing is the median of SCALE_SAMPLES (default 5) runs after one
 * warmup run. Heap figures are V8 heapUsed after a full GC, in MB.
 */
import os from "node:os";
import { writeFileSync } from "node:fs";
import { Range } from "@vuu-ui/vuu-utils";
import { expect, test } from "vitest";
import { ModuleDataSource } from "../src/ModuleDataSource";
import { buildDataColumnMapFromSchema, Table } from "../src/Table";
import {
  AGGREGATIONS,
  ALTERNATE_AGGREGATIONS,
  CCY,
  createData,
  createRandom,
  createRow,
  EXCHANGE,
  groupKey,
  type Row,
  schema,
} from "./data";

globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
  callback(0);
  return 0;
};

const ROWS = Number(process.env.SCALE_ROWS ?? 1_000_000);
const SAMPLES = Number(process.env.SCALE_SAMPLES ?? 5);
const VIEWPORT = 50;
const BATCH = 1_000;
const MB = 2 ** 20;

/** Same shape as perf/metrics.ts Metric, so perf-report can chart it. */
export interface ScaleMetric {
  better: "lower";
  description: string;
  kind: "time" | "size";
  name: string;
  unit: string;
  value: number;
}

export interface ScaleResults {
  meta: {
    cpu: string;
    date: string;
    node: string;
    platform: string;
    rows: number;
    samples: number;
  };
  metrics: ScaleMetric[];
}

const metrics: ScaleMetric[] = [];

const settle = () => Promise.resolve();
const noop = () => undefined;

const heapUsed = () => {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (!gc) throw Error("run with --expose-gc (see vitest.scale.config.ts)");
  gc();
  gc();
  return process.memoryUsage().heapUsed;
};

const recordHeap = (name: string, description: string, bytes: number) => {
  metrics.push({
    better: "lower",
    description,
    kind: "size",
    name: `heap: ${name} (${ROWS} rows)`,
    unit: "MB",
    value: Math.max(0, bytes) / MB,
  });
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Times `run` SAMPLES times after one warmup. `prepare` (untimed) runs before
 * each sample, `run` receives the sample number so it can alternate.
 */
const time = async (
  name: string,
  description: string,
  run: (iteration: number) => unknown,
  prepare?: () => unknown,
) => {
  const samples: number[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    await prepare?.();
    await settle();
    const start = performance.now();
    await run(i);
    await settle();
    const elapsed = performance.now() - start;
    if (i > 0) samples.push(elapsed);
  }
  metrics.push({
    better: "lower",
    description: `${description}. Median of ${SAMPLES} runs.`,
    kind: "time",
    name: `${name} (${ROWS} rows)`,
    unit: "ms",
    value: median(samples),
  });
};

const createTable = (data: Row[]) =>
  new Table(schema, data, buildDataColumnMapFromSchema(schema));

const createDataSource = async (table: Table) => {
  const dataSource = new ModuleDataSource({
    columnDescriptors: schema.columns,
    table,
  });
  await dataSource.subscribe({ range: Range(0, VIEWPORT) }, noop);
  await settle();
  return dataSource;
};

// Tree keys built from the known values: getRowAtIndex only returns group
// rows inside the client range, so they can't be read by scanning rows.
const ccyKeys = CCY.map((ccy) => groupKey(ccy));
const exchangeKeys = CCY.flatMap((ccy) =>
  EXCHANGE.map((exchange) => groupKey(ccy, exchange)),
);

const resetConfig = (dataSource: ModuleDataSource) => {
  dataSource.groupBy = [];
  dataSource.aggregations = [];
  dataSource.sort = { sortDefs: [] };
  dataSource.filter = { filter: "" };
};

test(`engine at scale (${ROWS} rows)`, async () => {
  // ---- heap --------------------------------------------------------------
  const baseline = heapUsed();
  let data: Row[] | undefined = createData(ROWS);
  const withRows = heapUsed();
  recordHeap(
    "source row arrays",
    "The generated row arrays alone, before any table is built (context for the table figure)",
    withRows - baseline,
  );

  const table = createTable(data);
  data = undefined;
  const withTable = heapUsed();
  recordHeap(
    "table",
    "An engine Table holding every row, with its key index (the source array released)",
    withTable - baseline,
  );
  const sorted = await createDataSource(table);
  sorted.sort = { sortDefs: [{ column: "price", sortType: "A" }] };
  await settle();
  const beforeGrouped = heapUsed();
  recordHeap(
    "sorted data source",
    "A subscribed data source sorted on price, over the shared table",
    beforeGrouped - withTable,
  );

  const grouped = await createDataSource(table);
  grouped.groupBy = ["ccy", "exchange"];
  grouped.aggregations = AGGREGATIONS;
  for (const key of ccyKeys) grouped.openTreeNode(key);
  await settle();
  recordHeap(
    "grouped data source",
    "A subscribed data source grouped by ccy + exchange, with four aggregations and every ccy group expanded",
    heapUsed() - beforeGrouped,
  );
  sorted.unsubscribe();
  grouped.unsubscribe();

  // ---- timings -----------------------------------------------------------
  const source = createData(ROWS);
  await time(
    "build table",
    "Create an engine Table from pre-generated row arrays",
    () => createTable(source),
  );

  await time(
    "create + subscribe",
    "Create a ModuleDataSource over the table and subscribe a 50 row viewport",
    async () => {
      const dataSource = await createDataSource(table);
      dataSource.unsubscribe();
    },
  );

  const dataSource = await createDataSource(table);

  await time(
    "sort numeric column, toggle asc/desc",
    "Sort on price, alternating ascending and descending",
    (i) => {
      dataSource.sort = {
        sortDefs: [{ column: "price", sortType: i % 2 === 0 ? "A" : "D" }],
      };
    },
  );

  await time(
    "sort two columns",
    "Sort on ccy then qty, alternating the qty direction",
    (i) => {
      dataSource.sort = {
        sortDefs: [
          { column: "ccy", sortType: "A" },
          { column: "qty", sortType: i % 2 === 0 ? "A" : "D" },
        ],
      };
    },
  );
  resetConfig(dataSource);

  await time(
    "filter, alternating",
    "Alternate between two filters",
    (i) => {
      dataSource.filter = {
        filter: i % 2 === 0 ? 'ccy = "EUR" and price > 500' : 'side = "BUY"',
      };
    },
  );
  resetConfig(dataSource);

  await time(
    "groupBy ccy",
    "Group by ccy (cleared, untimed, before each run)",
    () => {
      dataSource.groupBy = ["ccy"];
    },
    () => {
      dataSource.groupBy = [];
    },
  );

  await time(
    "groupBy ccy + exchange with aggregations",
    "Group by ccy and exchange with four aggregations set (cleared, untimed, before each run)",
    () => {
      dataSource.groupBy = ["ccy", "exchange"];
    },
    () => {
      dataSource.groupBy = [];
      dataSource.aggregations = AGGREGATIONS;
    },
  );
  resetConfig(dataSource);

  dataSource.groupBy = ["ccy"];
  await time(
    "aggregations on ccy groups, switch sets",
    "Switch between two aggregation sets on a data source grouped by ccy",
    (i) => {
      dataSource.aggregations =
        i % 2 === 0 ? AGGREGATIONS : ALTERNATE_AGGREGATIONS;
    },
  );

  await time(
    "expand/collapse one ccy group",
    "Open the first ccy group, then close it",
    () => {
      dataSource.openTreeNode(0);
      dataSource.closeTreeNode(0);
    },
  );
  resetConfig(dataSource);

  dataSource.groupBy = ["ccy", "exchange"];
  dataSource.aggregations = AGGREGATIONS;
  await time(
    "expand all ccy + exchange groups, then collapse all",
    `Open all ${ccyKeys.length} ccy groups and the ${exchangeKeys.length} exchange groups within them, then close them all`,
    () => {
      for (const key of ccyKeys) dataSource.openTreeNode(key);
      for (const key of exchangeKeys) dataSource.openTreeNode(key);
      for (const key of exchangeKeys) dataSource.closeTreeNode(key);
      for (const key of ccyKeys) dataSource.closeTreeNode(key);
    },
  );
  resetConfig(dataSource);

  await time(
    "scroll, 100 range changes",
    "Move a 50 row viewport through the table in 100 steps",
    () => {
      const step = Math.floor((dataSource.size - VIEWPORT) / 100);
      for (let i = 0; i < 100; i++) {
        dataSource.range = Range(i * step, i * step + VIEWPORT);
      }
      dataSource.range = Range(0, VIEWPORT);
    },
  );

  // row keys are deterministic, built after the heap figures so they are not counted
  const liveKeys = Array.from({ length: ROWS }, (_, i) => `id-${i}`);
  const random = createRandom(7);
  const tick = () => {
    for (let i = 0; i < BATCH; i++) {
      const key = liveKeys[Math.floor(random() * liveKeys.length)];
      table.update(key, "price", Math.round(random() * 100_000) / 100);
    }
  };

  dataSource.sort = { sortDefs: [{ column: "price", sortType: "A" }] };
  await time(
    `ticks, ${BATCH} updates on sorted column`,
    `${BATCH} price updates to random rows of a view sorted on price`,
    tick,
  );
  resetConfig(dataSource);

  dataSource.groupBy = ["ccy"];
  dataSource.aggregations = AGGREGATIONS;
  dataSource.openTreeNode(0);
  await time(
    `ticks, ${BATCH} updates while grouped, aggregated and expanded`,
    `${BATCH} price updates to random rows of a view grouped by ccy with aggregations and one group expanded`,
    tick,
  );
  resetConfig(dataSource);

  let nextId = ROWS;
  dataSource.sort = { sortDefs: [{ column: "price", sortType: "A" }] };
  await time(
    `churn on sorted view, ${BATCH / 2} deletes + ${BATCH / 2} inserts`,
    "Delete random rows and insert new ones, on a view sorted on price",
    () => {
      for (let i = 0; i < BATCH / 2; i++) {
        const index = Math.floor(random() * liveKeys.length);
        const key = liveKeys[index];
        liveKeys[index] = liveKeys[liveKeys.length - 1];
        liveKeys.pop();
        table.delete(key);
      }
      for (let i = 0; i < BATCH / 2; i++) {
        const row = createRow(nextId++, random);
        liveKeys.push(row[0]);
        table.insert(row);
      }
    },
  );
  dataSource.unsubscribe();

  // ---- report ------------------------------------------------------------
  const results: ScaleResults = {
    meta: {
      cpu: os.cpus()[0]?.model ?? "unknown",
      date: new Date().toISOString(),
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      rows: ROWS,
      samples: SAMPLES,
    },
    metrics,
  };
  const width = Math.max(...metrics.map((m) => m.name.length));
  process.stdout.write(
    `\n${metrics.map((m) => `${m.name.padEnd(width)}  ${m.value.toFixed(2).padStart(9)} ${m.unit}`).join("\n")}\n\n`,
  );
  if (process.env.SCALE_OUT) {
    writeFileSync(process.env.SCALE_OUT, `${JSON.stringify(results, null, 2)}\n`);
  }
  expect(metrics.every((m) => Number.isFinite(m.value))).toBe(true);
});
