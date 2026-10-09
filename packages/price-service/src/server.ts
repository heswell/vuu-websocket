import {
  DataService,
  RemoteTableSubscription,
  TablePublisher,
} from "@heswell/service-utils";
import { Table } from "@heswell/vuu-table";
import { loadConfig } from "./config";
import { PriceGenerator } from "./PriceGenerator";
import { instrumentsSchema, pricesSchema } from "./tableSchemas";

export interface PriceServiceOptions {
  log?: (message: string) => void;
  port?: number;
  refDataUrl?: string;
  updatesPerSecond?: number;
}

/**
 * Publishes the prices resource, one price per instrument.
 *
 * Instruments are sourced from the reference data service. This service
 * starts regardless of whether that is available. Subscribers receive their
 * snapshot once instruments have been loaded. If reference data restarts,
 * instruments (and so prices) are reconciled when it comes back.
 */
export function start(options: PriceServiceOptions = {}) {
  const config = loadConfig();
  const log = options.log ?? console.log;
  const port = options.port ?? config.getNumber("service.port");
  const refDataUrl =
    options.refDataUrl ?? config.getString("services.refdata.url");
  const updatesPerSecond =
    options.updatesPerSecond ??
    config.getNumber("prices.updatesPerSecond", 10_000);

  const instruments = new Table({ schema: instrumentsSchema });
  const prices = new Table({ schema: pricesSchema });

  const publisher = new TablePublisher({ table: prices, ready: false });
  const generator = new PriceGenerator({ instruments, prices });
  const refData = new RemoteTableSubscription({
    columns: ["ric"],
    log,
    name: "PRICES:service",
    resource: "instruments",
    table: instruments,
    url: refDataUrl,
  });

  const service = new DataService({ name: "PRICES:service", port, log })
    .addPublisher(publisher)
    .addGenerator(generator)
    .addDependency(refData)
    .start();

  refData.firstSnapshot.then(() => {
    log(`[PRICES:service] ${prices.rowCount} prices created`);
    publisher.setReady();
    if (updatesPerSecond > 0) {
      generator.start(updatesPerSecond);
    }
  }, () => undefined);

  return { generator, instruments, prices, refData, service };
}
