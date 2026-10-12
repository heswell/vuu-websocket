import { getLogger, Provider } from "@heswell/vuu-server";
import { getData } from "./instrument-data";

const log = getLogger("demo.test");

export class InstrumentProvider extends Provider {
  async load() {
    log.debug(
      `${this.table.schema.table.module} InstrumentProvider load instruments`
    );

    const data = getData(this.table.schema);

    for (const dataRow of data) {
      this.table.insert(dataRow, false);
    }
  }
}
