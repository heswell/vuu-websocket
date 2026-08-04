import type { Table } from "@heswell/data";
import { Provider } from "@heswell/vuu-server";
import type { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

export class BasketPricesProvider extends Provider {
  constructor(
    table: Table,
    private readonly constituentRows: readonly VuuDataRow[],
  ) {
    super(table);
  }

  async load() {
    const rics = new Set(
      this.constituentRows.map((row) => row[4]).filter((ric) => ric !== ""),
    );
    let index = 0;

    for (const ric of rics) {
      const mid = 50 + (index++ % 100);
      this.table.insert(
        [
          mid + 0.01,
          10_000,
          mid - 0.01,
          10_000,
          mid - 0.25,
          mid,
          mid - 0.1,
          "CONTINUOUS",
          ric,
          "default",
        ],
        false,
      );
    }
  }
}
