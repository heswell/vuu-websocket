/**
 * Compares the engine backed ModuleDataSource (this package) with the legacy
 * ArrayDataSource based TickingArrayDataSource (@vuu-ui/vuu-data-test) on the
 * same scenarios. Run with `npm run bench:data-engine`.
 *
 * requestAnimationFrame is made synchronous so that every measurement includes
 * the work needed to deliver rows to the client, not just to compute them.
 * Row count can be set with BENCH_ROWS (default 100_000).
 *
 * Group rows are opened by key, read from the row (index 6), so both
 * implementations use their own tree key format.
 *
 * Note: on table updates the legacy implementation does not re-sort or
 * re-filter rows, the engine does. test/LegacyParity.test.ts verifies both
 * produce the same results for the config (sort/filter/groupBy) scenarios.
 */
import type { DataSourceSubscribeCallback } from "@vuu-ui/vuu-data-types";
import {
  buildDataColumnMapFromSchema as buildLegacyDataMap,
  TickingArrayDataSource as LegacyDataSource,
  Table as LegacyTable,
} from "@vuu-ui/vuu-data-test";
import { Range } from "@vuu-ui/vuu-utils";
import { bench, describe } from "vitest";
import { ModuleDataSource } from "../src/ModuleDataSource";
import { buildDataColumnMapFromSchema, Table } from "../src/Table";
import {
  AGGREGATIONS,
  ALTERNATE_AGGREGATIONS,
  createData as createRows,
  createRandom,
  createRow,
  type Row,
  schema,
} from "./data";

globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
  callback(0);
  return 0;
};
// legacy ArrayDataSource logs from its update path, keep I/O out of timings
console.log = () => undefined;

const ROWS = Number(process.env.BENCH_ROWS ?? 100_000);
const VIEWPORT = 50;
const BATCH = 1_000;
const createData = (count = ROWS) => createRows(count);

interface BenchTable {
  insert: (row: Row) => void;
  update: (key: string, column: string, value: number) => void;
  delete: (key: string) => void;
}

interface BenchDataSource {
  sort: unknown;
  filter: unknown;
  groupBy: unknown;
  aggregations: unknown;
  range: unknown;
  readonly size: number;
  getRowAtIndex: (index: number) => unknown[] | undefined;
  openTreeNode: (keyOrIndex: string | number) => void;
  closeTreeNode: (keyOrIndex: string | number) => void;
  subscribe: (
    props: { range: ReturnType<typeof Range> },
    callback: DataSourceSubscribeCallback,
  ) => unknown;
  unsubscribe: () => void;
}

interface Fixture {
  table: BenchTable;
  dataSource: BenchDataSource;
  nextId: number;
  liveKeys: string[];
  random: () => number;
}

interface Implementation {
  name: string;
  create: (data: Row[]) => { table: BenchTable; dataSource: BenchDataSource };
}

const implementations: Implementation[] = [
  {
    name: "legacy TickingArrayDataSource",
    create: (data) => {
      const table = new LegacyTable(schema, data, buildLegacyDataMap(schema));
      const dataSource = new LegacyDataSource({
        columnDescriptors: schema.columns,
        table,
      });
      return {
        table: table as unknown as BenchTable,
        dataSource: dataSource as unknown as BenchDataSource,
      };
    },
  },
  {
    name: "engine ModuleDataSource",
    create: (data) => {
      const table = new Table(
        schema,
        data,
        buildDataColumnMapFromSchema(schema),
      );
      const dataSource = new ModuleDataSource({
        columnDescriptors: schema.columns,
        table,
      });
      return {
        table: table as unknown as BenchTable,
        dataSource: dataSource as unknown as BenchDataSource,
      };
    },
  },
];

// one microtask lets the engine flush coalesced table changes; the legacy
// implementation delivers synchronously, so this is a no-op for it
const settle = () => Promise.resolve();

const noop = () => undefined;

const createFixture = async (impl: Implementation) => {
  const data = createData();
  const { table, dataSource } = impl.create(data);
  const fixture: Fixture = {
    table,
    dataSource,
    nextId: data.length,
    liveKeys: data.map((row) => row[0]),
    random: createRandom(7),
  };
  await dataSource.subscribe({ range: Range(0, VIEWPORT) }, noop);
  await settle();
  return fixture;
};

/**
 * Registers one bench per implementation inside the enclosing describe, so
 * vitest reports the relative speed of the two implementations.
 */
const compare = (
  run: (fixture: Fixture, iteration: number) => void | Promise<void>,
  prepare?: (fixture: Fixture) => void,
) => {
  for (const impl of implementations) {
    let fixture: Fixture | undefined;
    let iteration = 0;
    bench(
      impl.name,
      async () => {
        if (fixture) {
          await run(fixture, iteration++);
        }
      },
      {
        setup: async () => {
          fixture?.dataSource.unsubscribe();
          fixture = await createFixture(impl);
          prepare?.(fixture);
          await settle();
          iteration = 0;
        },
        teardown: () => {
          fixture?.dataSource.unsubscribe();
          fixture = undefined;
        },
      },
    );
  }
};

const tick = async (fixture: Fixture, inViewport: boolean) => {
  const { liveKeys, random, table } = fixture;
  for (let i = 0; i < BATCH; i++) {
    const index = Math.floor(
      random() * (inViewport ? VIEWPORT : liveKeys.length),
    );
    table.update(
      liveKeys[index],
      "price",
      Math.round(random() * 100_000) / 100,
    );
  }
  await settle();
};

const churn = async (fixture: Fixture) => {
  const { liveKeys, random, table } = fixture;
  for (let i = 0; i < BATCH / 2; i++) {
    const index = Math.floor(random() * liveKeys.length);
    const key = liveKeys[index];
    liveKeys[index] = liveKeys[liveKeys.length - 1];
    liveKeys.pop();
    table.delete(key);
  }
  for (let i = 0; i < BATCH / 2; i++) {
    const row = createRow(fixture.nextId++, random);
    liveKeys.push(row[0]);
    table.insert(row);
  }
  await settle();
};

const sortByPrice = (fixture: Fixture) => {
  fixture.dataSource.sort = { sortDefs: [{ column: "price", sortType: "A" }] };
};

const sharedData = createData();

describe(`create + subscribe (${ROWS} rows)`, () => {
  for (const impl of implementations) {
    bench(impl.name, async () => {
      const { dataSource } = impl.create(sharedData);
      await dataSource.subscribe({ range: Range(0, VIEWPORT) }, noop);
      await settle();
      dataSource.unsubscribe();
    });
  }
});

describe(`sort numeric column, toggle asc/desc (${ROWS} rows)`, () => {
  compare((fixture, i) => {
    fixture.dataSource.sort = {
      sortDefs: [{ column: "price", sortType: i % 2 === 0 ? "A" : "D" }],
    };
  });
});

describe(`sort two columns (${ROWS} rows)`, () => {
  compare((fixture, i) => {
    fixture.dataSource.sort = {
      sortDefs: [
        { column: "ccy", sortType: "A" },
        { column: "qty", sortType: i % 2 === 0 ? "A" : "D" },
      ],
    };
  });
});

describe(`filter, alternating (${ROWS} rows)`, () => {
  compare((fixture, i) => {
    fixture.dataSource.filter = {
      filter: i % 2 === 0 ? 'ccy = "EUR" and price > 500' : 'side = "BUY"',
    };
  });
});

describe(`groupBy ccy, set/clear (${ROWS} rows)`, () => {
  compare((fixture, i) => {
    fixture.dataSource.groupBy = i % 2 === 0 ? ["ccy"] : [];
  });
});

describe(`groupBy ccy + exchange, set/clear (${ROWS} rows)`, () => {
  compare((fixture, i) => {
    fixture.dataSource.groupBy = i % 2 === 0 ? ["ccy", "exchange"] : [];
  });
});

describe(`scroll, 100 range changes (${ROWS} rows)`, () => {
  compare((fixture) => {
    const step = Math.floor((fixture.dataSource.size - VIEWPORT) / 100);
    for (let i = 0; i < 100; i++) {
      fixture.dataSource.range = Range(i * step, i * step + VIEWPORT);
    }
    fixture.dataSource.range = Range(0, VIEWPORT);
  });
});

describe(`ticks, ${BATCH} updates to random rows (${ROWS} rows)`, () => {
  compare((fixture) => tick(fixture, false));
});

describe(`ticks, ${BATCH} updates to rows in viewport (${ROWS} rows)`, () => {
  compare((fixture) => tick(fixture, true));
});

describe(`ticks, ${BATCH} updates on sorted column (${ROWS} rows)`, () => {
  compare((fixture) => tick(fixture, false), sortByPrice);
});

describe(`ticks, ${BATCH} updates on filtered column (${ROWS} rows)`, () => {
  compare(
    (fixture) => tick(fixture, false),
    (fixture) => {
      fixture.dataSource.filter = { filter: "price > 500" };
    },
  );
});

describe(`ticks, ${BATCH} updates while grouped (${ROWS} rows)`, () => {
  compare(
    (fixture) => tick(fixture, false),
    (fixture) => {
      fixture.dataSource.groupBy = ["ccy"];
    },
  );
});

describe(`churn, ${BATCH / 2} deletes + ${BATCH / 2} inserts (${ROWS} rows)`, () => {
  compare(churn);
});

describe(`churn on sorted view, ${BATCH / 2} deletes + ${BATCH / 2} inserts (${ROWS} rows)`, () => {
  compare(churn, sortByPrice);
});

const KEY = 6;

const groupByCcy = (fixture: Fixture) => {
  fixture.dataSource.groupBy = ["ccy"];
};

// alternates between two aggregation sets: legacy throws when aggregations
// are cleared to [] on a grouped data source
describe(`aggregations on ccy groups, switch sets (${ROWS} rows)`, () => {
  compare((fixture, i) => {
    fixture.dataSource.aggregations =
      i % 2 === 0 ? AGGREGATIONS : ALTERNATE_AGGREGATIONS;
  }, groupByCcy);
});

describe(`groupBy ccy + exchange with aggregations, set/clear (${ROWS} rows)`, () => {
  compare(
    (fixture, i) => {
      fixture.dataSource.groupBy = i % 2 === 0 ? ["ccy", "exchange"] : [];
    },
    (fixture) => {
      fixture.dataSource.aggregations = AGGREGATIONS;
    },
  );
});

describe(`expand/collapse one ccy group (${ROWS} rows)`, () => {
  compare((fixture, i) => {
    if (i % 2 === 0) {
      fixture.dataSource.openTreeNode(0);
    } else {
      fixture.dataSource.closeTreeNode(0);
    }
  }, groupByCcy);
});

describe(`ticks, ${BATCH} updates while grouped, aggregated and expanded (${ROWS} rows)`, () => {
  compare(
    (fixture) => tick(fixture, false),
    (fixture) => {
      fixture.dataSource.groupBy = ["ccy"];
      fixture.dataSource.aggregations = AGGREGATIONS;
      fixture.dataSource.openTreeNode(0);
    },
  );
});
