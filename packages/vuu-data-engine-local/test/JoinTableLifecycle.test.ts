import "./browser-globals";
import { describe, expect, it, vi } from "bun:test";
import { JoinTable } from "@heswell/vuu-table";
import type { TableSchema } from "@vuu-ui/vuu-data-types";
import { Range } from "@vuu-ui/vuu-utils";
import { createLocalEngine } from "../src/core/engine/LocalEngine";
import { VuuModule } from "../src/core/module/VuuModule";
import {
  createJoinTable,
  type JoinTableHandle,
  TableContainer,
} from "../src/core/table/TableContainer";
import { EngineDataSource } from "../src/EngineDataSource";
import { Table } from "../src/Table";

const JOIN = { module: "TEST", table: "instrumentPrices" };

const instrumentsSchema: TableSchema = {
  key: "ric",
  table: { module: "TEST", table: "instruments" },
  columns: [
    { name: "ric", serverDataType: "string" },
    { name: "exchange", serverDataType: "string" },
  ],
};
const pricesSchema: TableSchema = {
  key: "ric",
  table: { module: "TEST", table: "prices" },
  columns: [
    { name: "ric", serverDataType: "string" },
    { name: "bid", serverDataType: "double" },
  ],
};
const declaredSchema: TableSchema = {
  key: "ric",
  table: JOIN,
  columns: [
    { name: "ric", serverDataType: "string" },
    { name: "exchange", serverDataType: "string" },
    { name: "bid", serverDataType: "double" },
  ],
};

const sources = () => ({
  instruments: new Table(instrumentsSchema, [
    ["A", "XLON"],
    ["B", "XLON"],
  ]),
  prices: new Table(pricesSchema, [["A", 1.5]]),
});

const subscribe = async (table: Table) => {
  const dataSource = new EngineDataSource({
    columnDescriptors: table.schema.columns,
    table,
  });
  const callback = vi.fn();
  const resize = vi.fn();
  dataSource.on("resize", resize);
  await dataSource.subscribe({ range: Range(0, 10) }, callback);
  const subscribed = callback.mock.calls.find(
    ([message]) => message.type === "subscribed",
  )?.[0];
  return { dataSource, subscribed, resize };
};

class JoinModule extends VuuModule<"instrumentPrices"> {
  protected menus = { instrumentPrices: undefined };
  protected schemas: Record<"instrumentPrices", TableSchema>;
  protected services = { instrumentPrices: undefined };
  protected tables: Record<"instrumentPrices", Table>;
  protected menuServices = undefined;
  protected visualLinks = undefined;
  readonly join: JoinTableHandle;

  constructor(instruments: Table, prices: Table) {
    super("TEST");
    this.join = createJoinTable(JOIN, instruments, prices, "ric", {
      schema: declaredSchema,
      joinType: "leftOuter",
    });
    this.tables = { instrumentPrices: this.join };
    // the join's own schema, now identical to the declared schema
    this.schemas = { instrumentPrices: this.join.schema };
  }
}

// trader upstream issue 79: a typed way to dispose a join
describe("Table.destroy", () => {
  it("createJoinTable returns a JoinTable-backed Table", () => {
    const { instruments, prices } = sources();
    const join = createJoinTable(JOIN, instruments, prices, "ric");
    const engineTable: JoinTable = join.engineTable;
    expect(engineTable).toBeInstanceOf(JoinTable);
    // still assignable to the base Table type
    const table: Table = join;
    expect(table).toBe(join);
  });

  it("detaches the join from its sources, and is idempotent", () => {
    const { instruments, prices } = sources();
    const join = createJoinTable(JOIN, instruments, prices, "ric", {
      schema: declaredSchema,
      joinType: "leftOuter",
    });
    expect(instruments.engineTable.listenerCount).toBe(2);
    expect(prices.engineTable.listenerCount).toBe(2);
    prices.insert(["B", 2.5]);
    expect(join.findByKey("B")).toEqual(["B", "XLON", 2.5]);

    const onUpdate = vi.fn();
    join.on("update", onUpdate);
    join.destroy();
    expect(join.destroyed).toBe(true);
    expect(instruments.engineTable.listenerCount).toBe(1);
    expect(prices.engineTable.listenerCount).toBe(1);

    prices.update("A", "bid", 9.9);
    instruments.insert(["C", "XNYS"]);
    expect(join.findByKey("A")).toEqual(["A", "XLON", 1.5]);
    expect(join.findByKey("C")).toBeUndefined();
    expect(onUpdate).not.toHaveBeenCalled();

    expect(() => join.destroy()).not.toThrow();
    // sources are unaffected
    expect(prices.findByKey("A")).toEqual(["A", 9.9]);
  });

  it("is safe on a plain table", () => {
    const { instruments } = sources();
    instruments.destroy();
    instruments.destroy();
    expect(instruments.destroyed).toBe(true);
    expect(instruments.engineTable.listenerCount).toBe(0);
  });

  it("engine.dispose destroys join tables of the modules it owns", () => {
    const { instruments, prices } = sources();
    const module = new JoinModule(instruments, prices);
    const engine = createLocalEngine({ modules: [module] });
    expect(prices.engineTable.listenerCount).toBe(2);
    engine.dispose();
    expect(module.join.destroyed).toBe(true);
    expect(prices.engineTable.listenerCount).toBe(1);
    prices.update("A", "bid", 9.9);
    expect(module.join.findByKey("A")).toEqual(["A", "XLON", 1.5]);
  });

  it("engine.unregister does not destroy the module's tables", () => {
    const { instruments, prices } = sources();
    const module = new JoinModule(instruments, prices);
    const engine = createLocalEngine({ modules: [module] });
    engine.unregister("TEST");
    expect(module.join.destroyed).toBe(false);
    module.dispose();
    expect(module.join.destroyed).toBe(true);
  });

  it("TableContainer.clear destroys tables it created", () => {
    const { instruments, prices } = sources();
    const container = new TableContainer();
    container.addTable(instruments);
    container.addTable(prices);
    const join = container.createJoinTable(
      JOIN,
      instrumentsSchema.table,
      pricesSchema.table,
      "ric",
    );
    const engineTable: JoinTable = join.engineTable;
    expect(engineTable).toBeInstanceOf(JoinTable);
    container.clear();
    expect(join.destroyed).toBe(true);
    expect(instruments.destroyed).toBe(false);
    expect(prices.engineTable.listenerCount).toBe(1);
  });

  it("TableContainer.removeTable does not destroy the table", () => {
    const { instruments, prices } = sources();
    const container = new TableContainer();
    container.addTable(instruments);
    container.addTable(prices);
    const join = container.createJoinTable(
      JOIN,
      "instruments",
      "prices",
      "ric",
    );
    container.removeTable(JOIN);
    container.clear();
    expect(join.destroyed).toBe(false);
    join.destroy();
  });
});

// trader upstream issue 80: a declared join schema is preserved exactly
describe("createJoinTable declared schema", () => {
  it("Table.schema, getTableSchema and the subscribed tableSchema equal the declared schema", async () => {
    const { instruments, prices } = sources();
    const module = new JoinModule(instruments, prices);
    const engine = createLocalEngine({ modules: [module] });
    expect(module.join.schema).toEqual(declaredSchema);
    expect(Object.keys(module.join.schema).sort()).toEqual(
      Object.keys(declaredSchema).sort(),
    );
    expect(engine.getTableSchema(JOIN)).toEqual(declaredSchema);
    const { subscribed } = await subscribe(module.join);
    expect(subscribed.tableSchema).toEqual(declaredSchema);
    engine.dispose();
  });

  it("does not mutate the declared schema", () => {
    const { instruments, prices } = sources();
    const declared = structuredClone(declaredSchema);
    createJoinTable(JOIN, instruments, prices, "ric", { schema: declared });
    expect(declared).toEqual(declaredSchema);
  });

  it("still applies the engine default range limits internally", async () => {
    const { instruments, prices } = sources();
    const join = createJoinTable(JOIN, instruments, prices, "ric", {
      schema: declaredSchema,
    });
    expect(join.rangeLimits).toEqual({
      maxRangeEnd: 1_000_000,
      maxRangeWidth: 1_000,
    });
    const { resize } = await subscribe(join);
    expect(resize).toHaveBeenCalledWith(expect.any(Number), 1_000_000);
  });

  it("enforces declared range limits", async () => {
    const { instruments, prices } = sources();
    const rangeLimits = { maxRangeEnd: 500, maxRangeWidth: 100 };
    const declared = { ...declaredSchema, rangeLimits };
    const join = createJoinTable(JOIN, instruments, prices, "ric", {
      schema: declared,
    });
    expect(join.schema).toEqual(declared);
    expect(join.rangeLimits).toEqual(rangeLimits);
    const { resize } = await subscribe(join);
    expect(resize).toHaveBeenCalledWith(expect.any(Number), 500);
  });

  it("plain tables are unchanged: no range limits unless declared", () => {
    const { instruments } = sources();
    expect(instruments.schema).toBe(instrumentsSchema);
    expect(instruments.rangeLimits).toBeUndefined();
  });

  it("generated schemas (default and columns) keep the default rangeLimits", () => {
    const { instruments, prices } = sources();
    const defaults = { maxRangeEnd: 1_000_000, maxRangeWidth: 1_000 };
    expect(
      createJoinTable(JOIN, instruments, prices, "ric").schema.rangeLimits,
    ).toEqual(defaults);
    expect(
      createJoinTable(JOIN, instruments, prices, "ric", {
        columns: ["ric", "bid"],
      }).schema.rangeLimits,
    ).toEqual(defaults);
  });
});
