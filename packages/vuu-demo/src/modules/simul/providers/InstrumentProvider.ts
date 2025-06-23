import { loadResource } from "@heswell/service-utils";
import { Provider } from "@heswell/vuu-server";

const refDataServiceUrl = `ws://localhost:${process.env.REFDATA_URL}`;

export class InstrumentProvider extends Provider {
  #loadPromise: Promise<void> | undefined;
  async load() {
    if (this.#loadPromise === undefined) {
      const count = await loadResource({
        resource: "instruments",
        url: refDataServiceUrl,
        table: this.table,
      });
      console.log(`${count} rows inserted`);
    } else {
      throw Error("[InstrumentProvider] load has already been called");
    }
  }
}
