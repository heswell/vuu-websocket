import { Table } from "@heswell/data";
import { Provider } from "@heswell/vuu-server";
import logger from "../../logger";
import { ResourceMessage, SnapshotBatch, Upsert } from "@heswell/service-utils";

const priceServiceUrl = `ws://localhost:${process.env.PRICES_URL}`;
let messageCount = 0;

export class PricesProvider extends Provider {
  #loadPromise: Promise<void> | undefined;

  constructor(table: Table) {
    super(table);
  }

  async load() {
    if (this.#loadPromise === undefined) {
      this.#loadPromise = new Promise((resolve, reject) => {
        try {
          console.log(
            `[PRICES:module:PricesProvider] load prices, subscribing to price service on ${priceServiceUrl}`
          );
          const socket = new WebSocket(priceServiceUrl);
          socket.addEventListener("message", (evt) => {
            const priceServiceMessage = JSON.parse(evt.data as string) as
              | ResourceMessage
              | { type: "HB" };
            logger.info(
              { orderServiceMessage: priceServiceMessage },
              `[PRICES:module:PricesProvider] IN `
            );
            if (Array.isArray(priceServiceMessage)) {
              logger.info(
                `[PRICES:module:PricesProvider] ${priceServiceMessage.length} messages from PriceService`
              );
              for (const message of priceServiceMessage) {
                const { row } = message as Upsert;
                this.table.upsert(row);
                messageCount += 1;
              }
            } else {
              // TODO does this make sense - is there a distinction between
              // initial load and any other insert/update ?
              if (priceServiceMessage.type === "HB") {
                socket.send(`{"type": "HB", "ts": ${Date.now()}}`);
              } else if (priceServiceMessage.type === "snapshot-batch") {
                for (const row of priceServiceMessage.rows) {
                  this.table.upsert(row);
                }
              } else if (priceServiceMessage.type === "snapshot-count") {
                console.log(
                  `[PRICES:module:PricesProvider] snapshot received, ${priceServiceMessage.count} rows loaded`
                );
                this.loaded = true;
                resolve();
                // } else if (orderServiceMessage.type === "insert") {
                //   this.table.upsert(orderServiceMessage.data);
                //   messageCount += 1;
              } else {
                console.log(
                  `[PRICES:module:PricesProvider] priceServiceMessage IN, unexpected priceServiceMessage type '${priceServiceMessage.type}'`
                );
              }
            }
          });
          socket.addEventListener("error", (event) => {
            logger.info(
              `[PRICES:module:PricesProvider] error subscribing to all prices`
            );
          });
          socket.addEventListener("close", (event) => {
            logger.info(`[PRICES:module:PricesProvider] websocket closed`);
          });
          socket.addEventListener("open", (event) => {
            console.log(
              `[PRICES:module:PricesProvider] websocket open, subscribing to all prices`
            );
            socket.send(
              JSON.stringify({ type: "subscribe", resource: "prices" })
            );
          });
        } catch (err) {
          console.log(
            `[PRICES:module:PricesProvider] unable to connect to ${priceServiceUrl}`
          );
          reject(err);
        }

        resolve();
      });
      return this.#loadPromise;
    } else {
      throw Error(
        "[PRICES:module:PricesProvider] load has already been called"
      );
    }
  }
}
