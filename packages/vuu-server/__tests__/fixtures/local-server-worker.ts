// A Web Worker hosting a local Vuu server, as a UI app would run one.
import { createLocalVuuServer } from "../../src/browser";
import { instrumentsModule } from "./instruments-module";

declare const self: Worker;

const localServer = createLocalVuuServer({ modules: [instrumentsModule()] });
await localServer.start();
localServer.acceptConnections(self);
self.postMessage({ type: "ready" });
