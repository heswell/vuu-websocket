import { Provider } from "@heswell/vuu-server";

const ordersServiceUrl = `ws://localhost:${process.env.ORDERS_URL}`;

export class ParentOrdersProvider extends Provider {
  #loadPromise: Promise<void> | undefined;
  async load() {
    if (this.#loadPromise === undefined) {
      this.#loadPromise = new Promise((resolve, reject) => {
        console.log(
          `[ParentOrdersProvider] load parent orders, subscribing to orders service on ${ordersServiceUrl}`
        );

        try {
          const socket = new WebSocket(ordersServiceUrl);

          socket.addEventListener("message", (evt) => {
            const message = JSON.parse(evt.data as string);
            if (typeof message.count === "number") {
              // all done
              console.log(`[ParentOrdersProvider] ${message.count} loaded`);
              this.loaded = true;
              resolve();
            } else {
              for (const order of message.parentOrders) {
                this.table.insert(order);
              }
            }
          });

          // socket opened
          socket.addEventListener("open", (event) => {
            console.log(`[ParentOrdersProvider] websocket open`);
            socket.send(JSON.stringify({ type: "parentOrders" }));
          });
        } catch (err) {
          reject(err);
        }
      });

      return this.#loadPromise;
    } else {
      throw Error("[ParentOrdersProvider] load has already been called");
    }
  }
}
