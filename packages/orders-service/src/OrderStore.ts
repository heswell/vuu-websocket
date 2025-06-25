import { Table } from "@heswell/data";
import {
  type IDataStore,
  loadTableFromRemoteResource,
  MessageQueue,
  type ResourceMessage,
} from "@heswell/service-utils";
import { IDequeue } from "@heswell/service-utils/src/MessageQueue";
import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import logger from "./logger";
import { ParentOrderDto } from "./order-service-types";
import { instrumentsSchema, parentOrdersSchema } from "./tableSchemas";

const refDataServiceUrl = `ws://localhost:${process.env.REFDATA_URL}`;

// TODO error handler
async function loadInstruments(
  table: Table,
  resolve: (value: void | PromiseLike<void>) => void
) {
  loadTableFromRemoteResource({
    resource: "instruments",
    table,
    url: refDataServiceUrl,
  }).then(() => {
    console.log(
      `[ORDERS:service:OrderStore] ready (${table.rowCount} instruments loaded)`
    );
    resolve();
    import("./order-factory");
  });
}

export class OrderStore implements IDataStore, IDequeue<ResourceMessage> {
  static #instance: OrderStore;

  public static get instance(): OrderStore {
    if (!OrderStore.#instance) {
      OrderStore.#instance = new OrderStore();
    }
    return OrderStore.#instance;
  }

  #instrumentsTable: Table = new Table({ schema: instrumentsSchema });
  #parentOrdersTable = new Table({ schema: parentOrdersSchema });
  #parentOrdersColumns = parentOrdersSchema.columns.map((col) => col.name);
  #queue = new MessageQueue<ResourceMessage>();

  #ready: Promise<void>;

  private constructor() {
    const { promise, resolve } = Promise.withResolvers<void>();
    this.#ready = promise;
    loadInstruments(this.#instrumentsTable, resolve);
  }

  getSnapshot(resource: string) {
    if (resource === "parentOrders") {
      return this.#parentOrdersTable.rows;
    } else {
      throw Error(`[OrderStore] no resource ${resource}`);
    }
  }

  get ready() {
    return this.#ready;
  }

  get hasUpdates() {
    console.log(
      `[ORDERS:service:OrderStore] hasUpdates ? ququq length = ${
        this.#queue.length
      }`
    );
    return this.#queue.length > 0;
  }

  dequeueAllMessages() {
    return this.#queue.dequeueAllMessages();
  }

  addParentOrder(order: ParentOrderDto, publishMessage = false) {
    logger.info(
      `[OrderStore] addParentOrder (publish ${publishMessage}),  id: ${order.id} created: ${order.created}`
    );
    const columns = this.#parentOrdersColumns;
    const colCount = columns.length;
    const dataRow: VuuDataRow = Array(colCount);
    // export data in same order that columns are specified in schema
    for (let i = 0; i < colCount; i++) {
      dataRow[i] = order[columns[i]];
    }
    this.#parentOrdersTable.insert(dataRow);

    // if (order.status === "NEW") {
    //   order.on("update", this.handleParentOrderUpdate);
    // }

    if (publishMessage) {
      this.#queue.push({
        type: "insert",
        tableName: "parentOrders",
        data: dataRow,
      });
    }
  }

  handleParentOrderUpdate = (update) => {
    console.log(`parent order updated`);
  };

  get instrumentsTable() {
    return this.#instrumentsTable;
  }
}

export default OrderStore.instance;
