import { Table } from "@heswell/data";
import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import { loadInstruments } from "./instrument-loader";
import { MessageQueue } from "./MessageQueue";
import { OrdersServiceMessage, ParentOrderDto } from "./order-service-types";
import { instrumentsSchema, parentOrdersSchema } from "./tableSchemas";
import logger from "../logger";

export class OrderStore {
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
  #queue = new MessageQueue<OrdersServiceMessage>();

  #ready: Promise<void>;

  private constructor() {
    const { promise, resolve } = Promise.withResolvers<void>();
    this.#ready = promise;
    loadInstruments(this.#instrumentsTable).then(() => {
      console.log(
        `[ORDERS:service:OrderStore] ready (${
          this.#instrumentsTable.rowCount
        } instruments loaded)`
      );
      resolve();
      import("./order-factory");
    });
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
    return this.#queue.dequeueAll();
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

  get parentOrders() {
    return this.#parentOrdersTable.rows;
  }
}

export default OrderStore.instance;
