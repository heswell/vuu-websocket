import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

const orderWorkerUrl = new URL("OrderWorker.ts", import.meta.url);
const orderWorker = new Worker(orderWorkerUrl.href);

export const parentOrders: VuuDataRow[] = [];
export const childOrders: VuuDataRow[] = [];
export const fills: VuuDataRow[] = [];

orderWorker.onmessage = async (evt: MessageEvent) => {
  if (evt.data.parentOrder) {
    parentOrders.push(evt.data.parentOrder);
  } else if (evt.data.childOrder) {
    childOrders.push(evt.data.parentOrder);
  } else if (evt.data.fill) {
    fills.push(evt.data.fill);
  }

  if (evt.data.count !== undefined) {
    console.timeEnd("parent order load");
    console.log(`${evt.data.count} parent orders loaded`);
  }
};

console.log("[ParentOrderStore] post 'create-orders' message to worker");
orderWorker.postMessage(JSON.stringify({ type: "create-orders" }));
