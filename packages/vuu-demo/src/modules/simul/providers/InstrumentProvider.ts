import { RemoteResourceMessageType } from "@heswell/service-utils/src/resource-loader";
import { ConfigFactory, RemoteProvider } from "@heswell/vuu-server";

const remoteResourceMessageType: RemoteResourceMessageType[] = [
  "snapshot",
  "insert",
];
export class InstrumentProvider extends RemoteProvider {
  remoteServiceDetails() {
    return {
      columns: [
        "bbg",
        "currency",
        "description",
        "exchange",
        "isin",
        "lotSize",
        "ric",
        "vuuCreatedTimestamp",
        "vuuUpdatedTimestamp",
      ],
      resource: "instruments",
      remoteResourceMessageType,
      url: ConfigFactory.load().getString("services.refdata.url"),
    };
  }
}
