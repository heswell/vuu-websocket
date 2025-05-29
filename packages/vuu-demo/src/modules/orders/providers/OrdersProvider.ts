import { Provider } from "@heswell/vuu-server";
import { sides } from "../../../reference-data/sides";
import { orderStatus } from "../../../reference-data/orderStatus";
import { algos } from "../../../reference-data/algos";

import { getRandom, random } from "../../../utils";
import { VuuDataRowDto } from "@vuu-ui/vuu-protocol-types";

// const ordersServiceUrl = `ws://localhost:${process.env.ORDERS_URL}`;

interface Order extends VuuDataRowDto {
  id: string;
  side: string;
  status: string;
  ric: string;
  algo: string;
  ccy: string;
  quantity: number;
  filledQuantity: number;
  account: string;
  trader: string;
  created: number;
  lastUpdated: number;
  column13: number;
  column14: number;
  column15: number;
  column16: number;
  column17: number;
  column18: number;
  column19: number;
  column20: number;
  column21: number;
  column22: number;
  column23: number;
  column24: number;
  column25: number;
  column26: number;
  column27: number;
  column28: number;
  column29: number;
  column30: number;
  column31: number;
  column32: number;
  column33: number;
  column34: number;
  column35: number;
  column36: number;
  column37: number;
  column38: number;
  column39: number;
  column40: number;
}

function Order(id: number): Order {
  return {
    id: "ELX" + `${id + 1}`.padStart(5, "0"),
    side: getRandom(sides),
    status: getRandom(orderStatus),
    ric: "VOD.L",
    algo: getRandom(algos),
    ccy: "USD",
    quantity: 1000,
    filledQuantity: 1000,
    account: "ABC",
    trader: "ABC",
    created: 0,
    lastUpdated: 0,
    column13: 12345,
    column14: 12345,
    column15: 12345,
    column16: 12345,
    column17: 12345,
    column18: 12345,
    column19: 12345,
    column20: 12345,
    column21: 12345,
    column22: 12345,
    column23: 12345,
    column24: 12345,
    column25: 12345,
    column26: 12345,
    column27: 12345,
    column28: 12345,
    column29: 12345,
    column30: 12345,
    column31: 12345,
    column32: 12345,
    column33: 12345,
    column34: 12345,
    column35: 12345,
    column36: 12345,
    column37: 12345,
    column38: 12345,
    column39: 12345,
    column40: 12345,
  };
}

const DATA_COUNT = 10_000;

export class OrdersProvider extends Provider {
  #loadPromise: Promise<void> | undefined;
  async load() {
    if (this.#loadPromise === undefined) {
      this.#loadPromise = new Promise((resolve, reject) => {
        // console.log(
        //   `[ParentOrdersProvider] load parent orders, subscribing to orders service on ${ordersServiceUrl}`
        // );
        // try {
        //   // const socket = new WebSocket(ordersServiceUrl);
        //   socket.addEventListener("message", (evt) => {
        //     const message = JSON.parse(evt.data as string);
        //     if (typeof message.count === "number") {
        //       // all done
        //       console.log(`[OrdersProvider] ${message.count} loaded`);
        //       this.loaded = true;
        //       resolve();
        //     } else {
        //       for (const order of message.parentOrders) {
        //         this.table.insert(order);
        //       }
        //     }
        //   });
        //   // socket opened
        //   socket.addEventListener("open", (event) => {
        //     console.log(`[ParentOrdersProvider] websocket open`);
        //     socket.send(JSON.stringify({ type: "parentOrders" }));
        //   });
        // } catch (err) {
        //   reject(err);
        // }

        const start = performance.now();
        for (let i = 0; i < DATA_COUNT; i++) {
          this.insertRow(Order(i));
        }
        const end = performance.now();
        console.log(
          `[OrdersProvider] took ${
            end - start
          }ms to generate ${DATA_COUNT} orders`
        );

        resolve();
      });

      return this.#loadPromise;
    } else {
      throw Error("[ParentOrdersProvider] load has already been called");
    }
  }
}
