import { ConfigFactory, RemoteProvider } from "@heswell/vuu-server";

export class PricesProvider extends RemoteProvider {
  remoteServiceDetails() {
    return {
      resource: "prices",
      url: ConfigFactory.load().getString("services.prices.url"),
    };
  }
}
