import { Provider } from "@heswell/vuu-server";
import type { OrdersServiceMessage } from "@heswell/orders-service";

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
            const payload = JSON.parse(evt.data as string);
            if (Array.isArray(payload)) {
              for (const item of payload) {
                const message = item as OrdersServiceMessage;
                this.table.upsert(message.data);
                messageCount += 1;
              }
            } else {
              const message = payload as OrdersServiceMessage;
              // TODO does this make sense - is there a distinction between
              // initial load and any other insert/update ?
              if (message.type === "HB") {
                socket.send(`{"type": "HB", "ts": ${Date.now()}}`);
              } else if (typeof message.count === "number") {
                console.log(`[OrdersProvider] ${message.count} loaded`);
                this.loaded = true;
                resolve();
              } else if (message.type === "insert") {
                const [firstElement] = message.data;
                if (Array.isArray(firstElement)) {
                  for (const order of message.data) {
                    this.table.upsert(order);
                  }
                  messageCount += message.data.length;
                } else {
                  this.table.upsert(message.data);
                  messageCount += 1;
                }
              } else {
                console.log(
                  `[ORDERS:module:OrdersProvider] message IN, unexpected message type '${message.type}'`
                );
              }
            }
          });
          socket.addEventListener("open", (event) => {
            console.log(
              `[ORDERS:module:OrdersProvider] websocket open, subscribing to all orders`
            );
            socket.send(JSON.stringify({ type: "subscribe" }));
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
