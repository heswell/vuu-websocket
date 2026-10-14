// Run in a plain bun subprocess by noDom.test.ts: no happy-dom, no browser
// globals, no shims. Importing the main entry and running an engine end to
// end (register a module, create a data source, subscribe, receive rows and
// updates, dispose) must not need a DOM (trader upstream issues 77 and 78).
import type {
  DataSourceSubscribeCallback,
  TableSchema,
} from "@vuu-ui/vuu-data-types";
import type { VuuLink } from "@vuu-ui/vuu-protocol-types";

const browserGlobals = [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "ResizeObserver",
  "IntersectionObserver",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "localStorage",
  "sessionStorage",
  "matchMedia",
];
const present = () =>
  browserGlobals.filter(
    (name) =>
      name in globalThis &&
      (globalThis as Record<string, unknown>)[name] !== undefined,
  );
// Bun defines navigator; it is not a DOM global but must not be relied on.
const domGlobals = present().filter((name) => name !== "navigator");
if (domGlobals.length > 0) {
  throw Error(`DOM globals present before import: ${domGlobals.join(", ")}`);
}

const pkg = await import("../../src/index");
const { Range } = await import("@vuu-ui/vuu-utils");

const instrumentsSchema: TableSchema = {
  key: "ric",
  table: { module: "NODOM", table: "instruments" },
  columns: [
    { name: "ric", serverDataType: "string" },
    { name: "exchange", serverDataType: "string" },
  ],
};
const pricesSchema: TableSchema = {
  key: "ric",
  table: { module: "NODOM", table: "prices" },
  columns: [
    { name: "ric", serverDataType: "string" },
    { name: "bid", serverDataType: "double" },
  ],
};
const instrumentPricesSchema: TableSchema = {
  key: "ric",
  table: { module: "NODOM", table: "instrumentPrices" },
  columns: [
    { name: "ric", serverDataType: "string" },
    { name: "exchange", serverDataType: "string" },
    { name: "bid", serverDataType: "double" },
  ],
};

type TableName = "instruments" | "prices" | "instrumentPrices";

class NoDomModule extends pkg.VuuModule<TableName> {
  protected menus = undefined;
  protected services = undefined;
  protected menuServices = undefined;
  protected schemas: Record<TableName, TableSchema>;
  protected tables: Record<TableName, InstanceType<typeof pkg.Table>>;
  protected visualLinks: Record<TableName, VuuLink[] | undefined> = {
    instruments: undefined,
    instrumentPrices: undefined,
    prices: [{ fromColumn: "ric", toTable: "instruments", toColumn: "ric" }],
  };

  constructor() {
    super("NODOM");
    const instruments = pkg.createTable(instrumentsSchema, [
      ["A", "XLON"],
      ["B", "XNYS"],
    ]);
    const prices = pkg.createTable(pricesSchema, [["A", 1.5]]);
    this.tables = {
      instruments,
      prices,
      instrumentPrices: pkg.createJoinTable(
        instrumentPricesSchema.table,
        instruments,
        prices,
        "ric",
        { schema: instrumentPricesSchema, joinType: "leftOuter" },
      ),
    };
    this.schemas = {
      instruments: instrumentsSchema,
      prices: pricesSchema,
      instrumentPrices: instrumentPricesSchema,
    };
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

const engine = pkg.createLocalEngine({
  modules: [new pkg.SimulModule(), new NoDomModule()],
});
const tables = engine.getTableList().length;
const module = engine.getModule("NODOM") as NoDomModule;

const received: unknown[][] = [];
const collect: DataSourceSubscribeCallback = (message) => {
  if ("rows" in message) {
    for (const row of message.rows ?? []) {
      received.push(row.slice(10));
    }
  }
};

// a visual link source and target, so post-subscribe link work is scheduled
const instruments = module.createDataSource("instruments");
await instruments.subscribe({ range: Range(0, 10) }, () => undefined);
const prices = module.createDataSource("prices");
await prices.subscribe({ range: Range(0, 10) }, () => undefined);

const dataSource = module.createDataSource("instrumentPrices");
await dataSource.subscribe({ range: Range(0, 10) }, collect);
const initialRows = received.splice(0);

module.getTable("prices").insert(["B", 2.5]);
await settle();
const updatedRows = received.splice(0);

const links = prices.links?.length ?? 0;

dataSource.unsubscribe();
prices.unsubscribe();
instruments.unsubscribe();
engine.dispose();
await settle();

console.log(
  JSON.stringify({
    browserGlobals: present().filter((name) => name !== "navigator"),
    initialRows,
    links,
    reactExports: [
      "createDataSourceProvider",
      "createLocalVuuServer",
      "LocalDataSourceProvider",
    ].filter((name) => name in pkg),
    tables,
    updatedRows,
  }),
);
