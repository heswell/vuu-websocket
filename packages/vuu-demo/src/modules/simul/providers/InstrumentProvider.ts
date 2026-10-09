import { ConfigFactory, RemoteProvider } from "@heswell/vuu-server";

export class InstrumentProvider extends RemoteProvider {
  remoteServiceDetails() {
    return {
      resource: "instruments",
      url: ConfigFactory.load().getString("services.refdata.url"),
    };
  }
}
