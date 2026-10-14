// trader upstream issue 21: engines are instance-based, tables keyed by {module, table}.
import "./browser-globals";
import type { TableSchema } from "@vuu-ui/vuu-data-types";
import { describe, expect, it } from "bun:test";
import {
  createLocalEngine,
  getDefaultEngine,
} from "../src/core/engine/LocalEngine";
import { VuuModule } from "../src/core/module/VuuModule";
import { registerDemoModules } from "../src/demo-modules";
import { TableContainer } from "../src/core/table/TableContainer";
import { buildDataColumnMapFromSchema, Table } from "../src/Table";

const createSchema = (module: string): TableSchema => ({
  columns: [
    { name: "id", serverDataType: "string" },
    { name: "name", serverDataType: "string" },
  ],
  key: "id",
  table: { module, table: "items" },
});

class ItemsModule extends VuuModule<"items"> {
  protected menus = { items: undefined };
  protected schemas: Record<"items", TableSchema>;
  protected services = { items: undefined };
  protected tables: Record<"items", Table>;
  protected menuServices = undefined;
  protected visualLinks = undefined;
  disposed = false;

  constructor(name: string, rowName: string) {
    super(name);
    const schema = createSchema(name);
    this.schemas = { items: schema };
    this.tables = {
      items: new Table(
        schema,
        [["1", rowName]],
        buildDataColumnMapFromSchema(schema),
      ),
    };
  }

  dispose() {
    this.disposed = true;
    super.dispose();
  }
}

const nameOf = (table: Table) => table.findByKey("1")?.[table.map.name];

describe("LocalEngine", () => {
  it("isolates two engines with same-named modules and tables", () => {
    const moduleA = new ItemsModule("ORDERS", "engine-a");
    const moduleB = new ItemsModule("ORDERS", "engine-b");
    const engineA = createLocalEngine({ modules: [moduleA] });
    const engineB = createLocalEngine({ modules: [moduleB] });

    expect(engineA.getModule("ORDERS")).toBe(moduleA);
    expect(engineB.getModule("ORDERS")).toBe(moduleB);
    expect(engineA.getTableList()).toEqual([
      { module: "ORDERS", table: "items" },
    ]);
    expect(
      nameOf(
        engineA.tableContainer.getTable({ module: "ORDERS", table: "items" }),
      ),
    ).toBe("engine-a");
    expect(
      nameOf(
        engineB.tableContainer.getTable({ module: "ORDERS", table: "items" }),
      ),
    ).toBe("engine-b");
    expect(getDefaultEngine().hasModule("ORDERS")).toBe(false);

    engineA.dispose();
    expect(moduleA.disposed).toBe(true);
    expect(moduleB.disposed).toBe(false);
    expect(engineB.getModule("ORDERS")).toBe(moduleB);
    expect(engineB.getTableList()).toHaveLength(1);
    engineB.dispose();
  });

  it("keys tables by module, so two modules can share a table name", () => {
    const orders = new ItemsModule("ORDERS", "orders");
    const fills = new ItemsModule("FILLS", "fills");
    const engine = createLocalEngine({ modules: [orders, fills] });

    expect(engine.getTableList()).toEqual([
      { module: "ORDERS", table: "items" },
      { module: "FILLS", table: "items" },
    ]);
    const { tableContainer } = engine;
    expect(
      nameOf(tableContainer.getTable({ module: "FILLS", table: "items" })),
    ).toBe("fills");
    expect(() => tableContainer.getTable("items")).toThrow(/ambiguous/);

    const ds = engine.createDataSource({ module: "FILLS", table: "items" });
    expect(ds.table).toEqual({ module: "FILLS", table: "items" });

    engine.unregister("ORDERS");
    expect(nameOf(tableContainer.getTable("items"))).toBe("fills");
    expect(engine.getTableList()).toEqual([
      { module: "FILLS", table: "items" },
    ]);
    engine.dispose();
    orders.dispose();
  });

  it("supports a standalone TableContainer keyed by {module, table}", () => {
    const container = new TableContainer();
    const a = container.createTable(createSchema("A"));
    const b = container.createTable(createSchema("B"));
    expect(container.getTable({ module: "A", table: "items" })).toBe(a);
    expect(container.getTable({ module: "B", table: "items" })).toBe(b);
    expect(container.hasTable({ module: "C", table: "items" })).toBe(false);
  });

  it("registerDemoModules registers SIMUL, BASKET and TEST with the given engine", () => {
    const engine = createLocalEngine();
    const { simulModule, basketModule, testModule } =
      registerDemoModules(engine);
    expect(engine.moduleNames.sort()).toEqual(["BASKET", "SIMUL", "TEST"]);
    expect(engine.getModule("SIMUL")).toBe(simulModule);
    expect(engine.getModule("BASKET")).toBe(basketModule);
    expect(engine.getModule("TEST")).toBe(testModule);
    expect(getDefaultEngine().moduleNames).toEqual([]);
    expect(
      engine.tableContainer.hasTable({ module: "SIMUL", table: "instruments" }),
    ).toBe(true);
    engine.dispose();
    expect(engine.moduleNames).toEqual([]);
  });
});
