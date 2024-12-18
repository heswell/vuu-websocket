import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

const instrumentWorkerUrl = new URL("InstrumentWorker.ts", import.meta.url);
const instrumentWorker = new Worker(instrumentWorkerUrl.href);

export const instruments: VuuDataRow[] = [];

console.time("instrument load");
instrumentWorker.onmessage = async (evt: MessageEvent) => {
  if (evt.data.instrument) {
    instruments.push(evt.data.instrument);
  }
  if (evt.data.count !== undefined) {
    console.timeEnd("instrument load");
    console.log(`${evt.data.count} instruments loaded`);
  }
};

instrumentWorker.postMessage(JSON.stringify({ type: "create-instruments" }));
