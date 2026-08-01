import { Table } from "@heswell/data";
import { Provider } from "@heswell/vuu-server";

export class ModuleDiscoveryProvider extends Provider {
  constructor(
    table: Table,
    private readonly rows: Array<Array<string | number | boolean>>,
  ) {
    super(table);
  }

  async load() {
    for (const row of this.rows) {
      this.table.insert(row, false);
    }
  }
}
