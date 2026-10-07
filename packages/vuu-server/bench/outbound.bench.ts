/**
 * Server outbound pipeline benchmark. Measures the full path from table
 * updates to serialized websocket messages:
 *
 *   table.update -> flushViewports -> Viewport.post -> OutboundRowPublishQueue
 *     -> DefaultMessageHandler.sendUpdates (format + JSON.stringify)
 *
 * The production runner sends one batch per session every 60ms. Here the
 * queue is drained to empty after each cycle so the CPU cost is measured.
 *
 *   bun packages/vuu-server/bench/outbound.bench.ts [--rows=100000]
 *     [--iterations=5] [--filter=<scenario substring>]
 */
import { Columns, TableDef, VuuUser } from "@heswell/vuu-server";
import type { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import { InMemDataTable } from "../src/core/table/InMemDataTable";
import { TableContainer } from "../src/core/table/TableContainer";
import type { ViewServerModule } from "../src/core/module/VsModule";
import { JoinTableProvider } from "../src/provider/JoinTableProvider";
import type { ProviderContainer } from "../src/provider/ProviderContainer";
import { OutboundRowPublishQueue } from "../src/util/PublishQueue";
import { flushViewports, type Viewport } from "../src/viewport/Viewport";
import { ViewportContainer } from "../src/viewport/ViewportContainer";
import {
  DefaultMessageHandler,
  type MessageHandler,
} from "../src/net/ClientConnectionCreator";
import type { Channel } from "../src/net/ws/Channel";
import type { FlowController } from "../src/net/flowcontrol/FlowController";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [k, v = "true"] = arg.replace(/^--/, "").split("=");
    return [k, v];
  }),
);
const ROWS = Number(args.rows ?? 100_000);
const ITERATIONS = Number(args.iterations ?? 5);
const VP_SIZE = 100;

let seed = 1;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const randInt = (n: number) => Math.floor(random() * n);

const CCYS = ["EUR", "GBP", "USD", "JPY", "CHF"];
const SIDES = ["BUY", "SELL"];
const TRADERS = ["steve", "anand", "chris", "keikeu", "pete", "maria"];

const createTable = () => {
  const tableDef = TableDef({
    name: "orders",
    keyField: "id",
    columns: Columns.fromNames(
      "id:string",
      "ccy:string",
      "side:string",
      "trader:string",
      "price:double",
      "qty:int",
      "filled:int",
      "bid:double",
      "ask:double",
      "created:long",
    ),
  });
  tableDef.setModule({ name: "BENCH" } as ViewServerModule);
  const table = new InMemDataTable(tableDef, new JoinTableProvider());
  for (let i = 0; i < ROWS; i++) {
    table.insert(
      [
        `order-${String(i).padStart(7, "0")}`,
        CCYS[i % CCYS.length],
        SIDES[i % 2],
        TRADERS[i % TRADERS.length],
        100 + random() * 10,
        1000 + randInt(9000),
        randInt(1000),
        99 + random(),
        100 + random(),
        1_700_000_000_000 + i,
      ],
      false,
    );
  }
  return table;
};

const tick = (table: InMemDataTable, rowIdx: number) => {
  const row = table.rows[rowIdx].slice() as VuuDataRow;
  row[4] = 100 + random() * 10;
  row[7] = 99 + random();
  row[8] = 100 + random();
  table.update(rowIdx, row);
};

interface Session {
  handler: MessageHandler;
  queue: OutboundRowPublishQueue;
  stats: { messages: number; bytes: number; rows: number };
  viewport: Viewport;
}

const createSession = (
  table: InMemDataTable,
  viewportContainer: ViewportContainer,
  n: number,
  options: { sort?: string; groupBy?: string[] } = {},
): Session => {
  const queue = new OutboundRowPublishQueue();
  const session = { sessionId: `session-${n}`, channelId: `channel-${n}` };
  const stats = { messages: 0, bytes: 0, rows: 0 };
  const channel = {
    send(json: string) {
      stats.messages += 1;
      stats.bytes += json.length;
    },
    close() {},
  } as unknown as Channel;
  const flowController: FlowController = {
    process() {},
    shouldSend: () => ({ type: "BATCHSIZE", size: 300 }),
  };
  const handler = DefaultMessageHandler(
    channel,
    queue,
    VuuUser("bench"),
    session,
    {} as never,
    flowController,
    {} as never,
    {} as never,
  );
  const viewport = viewportContainer.create(
    `req-${n}`,
    VuuUser("bench"),
    session,
    queue,
    table,
    {
      type: "CREATE_VP",
      table: table.tableDef.asVuuTable,
      aggregations: [],
      columns: table.tableDef.columns.map((c) => c.name),
      filterSpec: { filter: "" },
      groupBy: options.groupBy ?? [],
      range: { from: 0, to: VP_SIZE },
      sort: {
        sortDefs: options.sort ? [{ column: options.sort, sortType: "A" }] : [],
      },
    },
  );
  viewport.postDataForCurrentRange();
  return { handler, queue, stats, viewport };
};

const drain = (sessions: Session[]) => {
  for (const s of sessions) {
    while (!s.queue.isEmpty()) {
      s.stats.rows += Math.min(300, s.queue.length);
      s.handler.sendUpdates();
    }
  }
};

interface State {
  table: InMemDataTable;
  sessions: Session[];
}

interface Scenario {
  name: string;
  sessions?: number;
  sort?: string;
  groupBy?: string[];
  run: (state: State) => void;
}

const scenarios: Scenario[] = [
  {
    name: "tick 100 in-viewport rows, 1 flush per send (x100)",
    run: ({ table, sessions }) => {
      for (let c = 0; c < 100; c++) {
        for (let i = 0; i < VP_SIZE; i++) tick(table, i);
        flushViewports();
        drain(sessions);
      }
    },
  },
  {
    name: "tick 100 in-viewport rows, 10 flushes per send (x10)",
    run: ({ table, sessions }) => {
      for (let c = 0; c < 10; c++) {
        for (let f = 0; f < 10; f++) {
          for (let i = 0; i < VP_SIZE; i++) tick(table, i);
          flushViewports();
        }
        drain(sessions);
      }
    },
  },
  {
    name: "20 sessions, tick 1000 random + 20 visible rows (x20)",
    sessions: 20,
    run: ({ table, sessions }) => {
      for (let c = 0; c < 20; c++) {
        for (let i = 0; i < 1000; i++) tick(table, randInt(ROWS));
        for (let i = 0; i < 20; i++) tick(table, randInt(VP_SIZE));
        flushViewports();
        drain(sessions);
      }
    },
  },
  {
    name: "sorted by price, tick 1000 random rows (x20)",
    sort: "price",
    run: ({ table, sessions }) => {
      for (let c = 0; c < 20; c++) {
        for (let i = 0; i < 1000; i++) tick(table, randInt(ROWS));
        flushViewports();
        drain(sessions);
      }
    },
  },
  {
    name: "grouped by ccy,trader, tick 1000 random rows (x20)",
    groupBy: ["ccy", "trader"],
    run: ({ table, sessions }) => {
      for (let c = 0; c < 20; c++) {
        for (let i = 0; i < 1000; i++) tick(table, randInt(ROWS));
        flushViewports();
        drain(sessions);
      }
    },
  },
  {
    name: "scroll 100-row window x100",
    run: ({ sessions }) => {
      const vp = sessions[0].viewport;
      for (let i = 1; i <= 100; i++) {
        const from = i * 250;
        vp.setRange({ from, to: from + VP_SIZE });
        drain(sessions);
      }
    },
  },
];

const gc = () =>
  (globalThis as { Bun?: { gc(force: boolean): void } }).Bun?.gc(true);

const { log, info, debug } = console;
const silence = () => {
  console.log = console.info = console.debug = () => undefined;
};
const restore = () => {
  console.log = log;
  console.info = info;
  console.debug = debug;
};

const filter = args.filter as string | undefined;
silence();
const table = createTable();
restore();

log(
  `outbound pipeline benchmark, ${ROWS.toLocaleString()} rows, ${ITERATIONS} iterations`,
);
log("");
log("| scenario | median ms | min ms | messages | rows sent | KB sent |");
log("|---|---:|---:|---:|---:|---:|");

for (const scenario of scenarios) {
  if (filter && !scenario.name.includes(filter)) continue;
  const times: number[] = [];
  let messages = 0;
  let bytes = 0;
  let rows = 0;
  for (let i = 0; i <= ITERATIONS; i++) {
    silence();
    const tableContainer = new TableContainer(new JoinTableProvider());
    tableContainer.addTable(table);
    const viewportContainer = new ViewportContainer(
      tableContainer,
      {} as ProviderContainer,
    );
    const sessions = Array.from({ length: scenario.sessions ?? 1 }, (_, n) =>
      createSession(table, viewportContainer, n, scenario),
    );
    drain(sessions);
    for (const s of sessions) {
      s.stats.messages = s.stats.bytes = s.stats.rows = 0;
    }
    gc();
    const start = performance.now();
    scenario.run({ table, sessions });
    const elapsed = performance.now() - start;
    for (const s of sessions) s.viewport.destroy();
    restore();
    if (i > 0) {
      times.push(elapsed);
      messages = sessions.reduce((n, s) => n + s.stats.messages, 0);
      bytes = sessions.reduce((n, s) => n + s.stats.bytes, 0);
      rows = sessions.reduce((n, s) => n + s.stats.rows, 0);
    }
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  log(
    `| ${scenario.name} | ${median.toFixed(2)} | ${times[0].toFixed(2)} | ${messages} | ${rows} | ${(bytes / 1024).toFixed(0)} |`,
  );
}
