import { Provider } from "@heswell/vuu-server";
import logger from "../../../logger";
import { ResourceMessage, SnapshotBatch } from "@heswell/service-utils";

const ordersServiceUrl = `ws://localhost:${process.env.ORDERS_URL}`;
let messageCount = 0;

export class ParentOrdersProvider extends Provider {
  #loadPromise: Promise<void> | undefined;
  async load() {
    if (this.#loadPromise === undefined) {
      this.#loadPromise = new Promise((resolve, reject) => {
        console.log(
          `[ORDERS:module:OrdersProvider] load parent orders, subscribing to orders service on ${ordersServiceUrl}`
        );
        try {
          const socket = new WebSocket(ordersServiceUrl);
          socket.addEventListener("message", (evt) => {
            const orderServiceMessage = JSON.parse(evt.data as string) as
              | ResourceMessage
              | { type: "HB" };
            logger.info(
              { orderServiceMessage },
              `[ORDERS:module:ParentOrdersModule] IN `
            );
            if (Array.isArray(orderServiceMessage)) {
              console.log(
                `[ORDERS:module:ParentOrdersModule] ${orderServiceMessage.length} messages from OrdersService`
              );
              for (const message of orderServiceMessage) {
                const { rows: data } = message as SnapshotBatch;
                logger.info(
                  `[ORDERS:module:ParentOrdersModule] table.upsert ${data[0]}`
                );
                this.table.upsert(data);
                messageCount += 1;
              }
            } else {
              // TODO does this make sense - is there a distinction between
              // initial load and any other insert/update ?
              if (orderServiceMessage.type === "HB") {
                socket.send(`{"type": "HB", "ts": ${Date.now()}}`);
              } else if (orderServiceMessage.type === "snapshot-batch") {
                for (const row of orderServiceMessage.rows) {
                  this.table.upsert(row);
                }
              } else if (orderServiceMessage.type === "snapshot-count") {
                logger.info(
                  `[ORDERS:module:ParentOrdersProvider] bulk-insert-complete, ${orderServiceMessage.count} rows loaded`
                );
                this.loaded = true;
                resolve();
                // } else if (orderServiceMessage.type === "insert") {
                //   this.table.upsert(orderServiceMessage.data);
                //   messageCount += 1;
              } else {
                console.log(
                  `[ORDERS:module:ParentOrdersProvider] orderServiceMessage IN, unexpected orderServiceMessage type '${orderServiceMessage.type}'`
                );
              }
            }
          });
          socket.addEventListener("open", (event) => {
            logger.info(
              `[ORDERS:module:OrdersProvider] websocket open, subscribing to all orders`
            );
            socket.send(
              JSON.stringify({ type: "subscribe", resource: "parentOrders" })
            );
          });
        } catch (err) {
          reject(err);
        }

        resolve();
      });

      return this.#loadPromise;
    } else {
      throw Error(
        "[ORDERS:module:OrdersProvider] load has already been called"
      );
    }
  }
}
