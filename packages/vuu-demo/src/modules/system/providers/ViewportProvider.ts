import { Provider } from "@heswell/vuu-server";
import { VuuDataRow, VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";

export class ViewportProvider extends Provider {
  async load() {
    console.log(`[${this.table.schema.table.module}][ViewportProvider]`);

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
