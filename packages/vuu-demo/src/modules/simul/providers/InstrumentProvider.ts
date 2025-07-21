import { RemoteProvider } from "@heswell/vuu-server";

const refDataServiceUrl = `ws://localhost:${process.env.REFDATA_URL}`;

export class InstrumentProvider extends RemoteProvider {
  remoteServiceDetails() {
    return {
      resource: "instruments",
      url: refDataServiceUrl,
    };
  }
}
