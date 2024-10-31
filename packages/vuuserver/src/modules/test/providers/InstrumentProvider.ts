import { Provider } from "@heswell/vuu-module";
import { getData } from "./instrument-data";

export class InstrumentProvider extends Provider {
  async load() {
    console.log(
      `[${this.table.schema.table.module}][InstrumentProvider] load  instruments`
    );

    const data = getData(this.table.schema);

    for (const dataRow of data) {
      this.table.insert(dataRow, false);
    }
  }
}
