import { ConfigFactory, RemoteProvider } from "@heswell/vuu-server";

export class ParentOrdersProvider extends RemoteProvider {
  remoteServiceDetails() {
    return {
      resource: "parentOrders",
      url: ConfigFactory.load().getString("services.orders.url"),
    };
  }
}
