import { Table } from "@heswell/data";
import { Provider } from "@heswell/vuu-module";

export class ChildOrdersProvider extends Provider {
  constructor(table: Table) {
    super(table, ["parentOrders"]);
  }
  async load() {
    this.loaded = true;
    const { table } = this.table.schema;
    console.log(`load ChildOrdersProvider, table ${table.table}`);
  }
}
