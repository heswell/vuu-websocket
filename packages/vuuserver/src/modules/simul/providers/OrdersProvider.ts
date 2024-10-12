import { Table } from "@heswell/data";
import { Provider } from "@heswell/vuu-module";

export class OrdersProvider extends Provider {
  constructor(table: Table) {
    super(table, ["instruments"]);
  }
  async load() {
    this.loaded = true;
    const { table } = this.table.schema;
    console.log(`load OrdersProvider, table ${table.table}`);
  }
}
