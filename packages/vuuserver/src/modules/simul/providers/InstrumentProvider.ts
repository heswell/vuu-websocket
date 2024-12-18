import { Provider, random } from "@heswell/vuu-module";

const refDataServiceUrl = "ws://localhost:8091";

export class InstrumentProvider extends Provider {
  #loadPromise: Promise<void> | undefined;
  async load() {
    if (this.#loadPromise === undefined) {
      this.#loadPromise = new Promise((resolve, reject) => {
        console.log("[InstrumentProvider] load instruments");
        const socket = new WebSocket(refDataServiceUrl);

        socket.addEventListener("message", (evt) => {
          const message = JSON.parse(evt.data as string);
          if (message.count) {
            // all done
            console.log("[InstrumentProvider] loaded");
            this.loaded = true;
            resolve();
          } else {
            for (const instrument of message.instruments) {
              this.table.insert(instrument);
            }
          }
        });

        // socket opened
        socket.addEventListener("open", (event) => {
          console.log(`[RedDataClient] websocket open`);
          socket.send(JSON.stringify({ type: "instruments" }));
        });
      });
      return this.#loadPromise;
    } else {
      throw Error("[InstrumentProvider] repeat call to load");
    }
  }
}
