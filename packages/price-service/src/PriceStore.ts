import { Table } from "@heswell/data";
import {
  type IDataStore,
  loadResource,
  MessageQueue,
  type ResourceMessage,
} from "@heswell/service-utils";
import { IDequeue } from "@heswell/service-utils/src/MessageQueue";
import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import logger from "./logger";
import { instrumentsSchema, pricesSchema } from "./tableSchemas";
import { PriceDto } from "./PriceDto";

const refDataServiceUrl = `ws://localhost:${process.env.REFDATA_URL}`;

// TODO error handler
async function loadInstruments(
  table: Table,
  resolve: (value: void | PromiseLike<void>) => void
) {
  const start = performance.now();
  await loadResource({
    columns: ["ric"],
    resource: "instruments",
    table,
    url: refDataServiceUrl,
  });
  const end = performance.now();
  console.log(
    `[PRICES:service:PriceStore] ready (${
      table.rowCount
    } instruments loaded) took ${end - start}ms`
  );
  resolve();
  import("./price-factory");
}

export class PriceStore implements IDataStore, IDequeue<ResourceMessage> {
  static #instance: PriceStore;

  public static get instance(): PriceStore {
    if (!PriceStore.#instance) {
      PriceStore.#instance = new PriceStore();
    }
    return PriceStore.#instance;
  }

  #instrumentsTable: Table = new Table({ schema: instrumentsSchema });
  #priceTable = new Table({ schema: pricesSchema });
  #priceColumns = pricesSchema.columns.map((col) => col.name);
  #queue = new MessageQueue<ResourceMessage>();

  #ready: Promise<void>;

  private constructor() {
    const { promise, resolve } = Promise.withResolvers<void>();
    this.#ready = promise;
    loadInstruments(this.#instrumentsTable, resolve);
  }

  getSnapshot(resource: string) {
    if (resource === "prices") {
      return this.#priceTable.rows;
    } else {
      throw Error(`[Prices:service:PriceStore] no resource ${resource}`);
    }
  }

  get ready() {
    return this.#ready;
  }

  get hasUpdates() {
    if (this.#queue.length > 0) {
      console.log(
        `[Prices:service:PriceStore] hasUpdates ? queue length = ${
          this.#queue.length
        }`
      );
    }
    return this.#queue.length > 0;
  }

  dequeueAllMessages() {
    return this.#queue.dequeueAllMessages();
  }

  addPrice(price: PriceDto, publishMessage = false) {
    logger.info(
      `[Prices:service:PriceStore] add Price  (publish ${publishMessage}),  ric: ${price.ric} `
    );
    const columns = this.#priceColumns;
    const colCount = columns.length;
    const dataRow: VuuDataRow = Array(colCount);
    // export data in same order that columns are specified in schema
    for (let i = 0; i < colCount; i++) {
      dataRow[i] = price[columns[i]];
    }
    this.#priceTable.insert(dataRow);

    // if (order.status === "NEW") {
    //   order.on("update", this.handleParentOrderUpdate);
    // }

    if (publishMessage) {
      this.#queue.push({
        type: "insert",
        resource: "prices",
        row: dataRow,
      });
    }
  }

  updatePrice(dataRow: VuuDataRow) {
    this.#priceTable.upsert(dataRow, true);

    this.#queue.push({
      type: "update",
      resource: "prices",
      row: dataRow,
    });
  }

  get instrumentsTable() {
    return this.#instrumentsTable;
  }
}

export default PriceStore.instance;
