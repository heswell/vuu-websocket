import { Provider } from "@heswell/vuu-server";

const refDataServiceUrl = `ws://localhost:${process.env.REFDATA_URL}`;

export class InstrumentProvider extends Provider {
  #loadPromise: Promise<void> | undefined;
  async load() {
    if (this.#loadPromise === undefined) {
      this.#loadPromise = new Promise((resolve, reject) => {
        console.log(
          `[SIMUL InstrumentProvider] load instruments, subscribing to ref data service on ${refDataServiceUrl}`
        );

        try {
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
            console.log(
              `[SIMUL InstrumentProvider] websocket to RefData service open`
            );
            socket.send(JSON.stringify({ type: "instruments" }));
          });
        } catch (err) {
          reject(err);
        }
      });

      return this.#loadPromise;
    } else {
      throw Error("[InstrumentProvider] load has already been called");
    }
  }
}
