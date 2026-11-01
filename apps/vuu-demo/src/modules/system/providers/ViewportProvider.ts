import { getLogger, Provider } from "@heswell/vuu-server";
import { VuuDataRow, VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";

const log = getLogger("demo.system");

export class ViewportProvider extends Provider {
  async load() {
    log.debug(`${this.table.schema.table.module} ViewportProvider load`);

    const data: VuuDataRow[] = [];

    for (const dataRow of data) {
      this.table.insert(dataRow, false);
    }

    ViewportContainer.on(
      "viewport-created",
      ({ id, table: { module, table } }) => {
        this.table.insert([id, module, table]);
      }
    );
    ViewportContainer.on("viewport-removed", ({ id }) => {
      this.table.delete(id);
    });
  }
}
