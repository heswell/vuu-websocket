import { Table } from "@heswell/data";
import { Provider } from "@heswell/vuu-module";

export class PricesProvider extends Provider {
  constructor(table: Table) {
    super(table, ["instruments"]);
  }

  async load() {
    this.loaded = true;
    console.log("load PricesProvider");
  }
}
