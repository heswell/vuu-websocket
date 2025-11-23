import { RemoteResourceMessageType } from "@heswell/service-utils/src/resource-loader";
import { RemoteProvider } from "@heswell/vuu-server";

const refDataServiceUrl = `ws://localhost:${process.env.REFDATA_URL}`;

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
      ],
      resource: "instruments",
      remoteResourceMessageType,
      url: refDataServiceUrl,
    };
  }
}
