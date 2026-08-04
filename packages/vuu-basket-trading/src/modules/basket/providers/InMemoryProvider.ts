import type { Table } from "@heswell/data";
import { Provider } from "@heswell/vuu-server";
import type { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

export class InMemoryProvider extends Provider {
  constructor(
    table: Table,
    private readonly rows: readonly VuuDataRow[],
  ) {
    super(table);
  }

  async load() {
    for (const row of this.rows) {
      this.table.insert(row.slice(), false);
    }
  }
}
