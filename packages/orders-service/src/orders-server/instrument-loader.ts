import { TableSchema } from "@vuu-ui/vuu-data-types";
import { Table } from "@heswell/data";

const refDataServiceUrl = `ws://localhost:${process.env.REFDATA_URL}`;

export const loadInstruments = async (instrumentsTable: Table) => {
  let { promise, resolve } = Promise.withResolvers<void>();

  try {
    console.log(
      `[ORDERS:service:instrument-loader] open websocket to refdata on  ${refDataServiceUrl}`
    );

    const socket = new WebSocket(refDataServiceUrl);

    socket.addEventListener("message", (evt) => {
      const message = JSON.parse(evt.data as string);
      if (message.count) {
        socket.close();
        resolve();
      } else {
        for (const instrument of message.instruments) {
          instrumentsTable.insert(instrument);
        }
      }
    });

    // socket opened
    socket.addEventListener("open", (event) => {
      console.log(
        `[ORDERS:service:instrument-loader] websocket client open, about to load instruments from refdata service`
      );
      socket.send(JSON.stringify({ type: "instruments" }));
    });
  } catch (err) {
    console.log("[ORDERS:service:instrument-loader] error loading instruments");
  }

  return promise;
};
