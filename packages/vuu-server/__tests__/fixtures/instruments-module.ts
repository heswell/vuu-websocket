import { ModuleFactory, Provider, TableDef } from "../../src/browser";

class InstrumentProvider extends Provider {
  async load() {
    this.table.insert(["AAA.L", "AAA"]);
    this.table.insert(["BBB.L", "BBB"]);
    this.table.insert(["CCC.L", "CCC"]);
  }
}

/** A small module built only from the browser entry. */
export const instrumentsModule = () =>
  ModuleFactory.withNameSpace("TEST")
    .addTable(
      TableDef({
        columns: [
          { name: "ric", dataType: "string" },
          { name: "description", dataType: "string" },
        ],
        joinFields: "ric",
        keyField: "ric",
        name: "instruments",
      }),
      (table) => new InstrumentProvider(table),
    )
    .asModule();

export const createInstrumentsVp = {
  type: "CREATE_VP",
  table: { module: "TEST", table: "instruments" },
  aggregations: [],
  columns: ["ric", "description"],
  filterSpec: { filter: "" },
  groupBy: [],
  range: { from: 0, to: 10 },
  sort: { sortDefs: [] },
};
