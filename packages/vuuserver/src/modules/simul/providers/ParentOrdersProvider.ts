import { Table } from "@heswell/data";
import { Provider } from "@heswell/vuu-module";
import { Module } from "@heswell/vuu-module";

export class ParentOrdersProvider extends Provider {
  constructor(table: Table) {
    super(table, ["instruments"]);
  }
  async load(module: Module) {
    const { table } = this.table.schema;
    const instruments = module.getTable("instruments");
    console.log(
      `load ParentOrdersProvider, table ${table.table} (we have ${instruments.rowCount}) instruments`
    );
    this.loaded = true;
  }
}
