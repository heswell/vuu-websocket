import {
  DataService,
  RemoteTableSubscription,
  TablePublisher,
} from "@heswell/service-utils";
import { Table } from "@heswell/vuu-table";
import { loadConfig } from "./config";
import { OrderGenerator } from "./OrderGenerator";
import { instrumentsSchema, parentOrdersSchema } from "./tableSchemas";

export interface OrdersServiceOptions {
  initialOrderCount?: number;
  log?: (message: string) => void;
  newOrdersPerSecond?: number;
  port?: number;
  refDataUrl?: string;
}

/**
 * Publishes the parentOrders resource.
 *
 * Orders reference instruments sourced from the reference data service.
 * This service starts regardless of whether that is available, initial
 * orders are created, and subscribers receive their snapshot, once
 * instruments have been loaded.
 */
export function start(options: OrdersServiceOptions = {}) {
  const config = loadConfig();
  const log = options.log ?? console.log;
  const port = options.port ?? config.getNumber("service.port");
  const refDataUrl =
    options.refDataUrl ?? config.getString("services.refdata.url");
  const initialOrderCount =
    options.initialOrderCount ??
    config.getNumber("orders.initialCount", 10_000);
  const newOrdersPerSecond =
    options.newOrdersPerSecond ??
    config.getNumber("orders.newOrdersPerSecond", 0);

  const instruments = new Table({ schema: instrumentsSchema });
  const orders = new Table({ schema: parentOrdersSchema });

  const publisher = new TablePublisher({ table: orders, ready: false });
  const generator = new OrderGenerator({ instruments, orders });
  const refData = new RemoteTableSubscription({
    columns: ["currency", "ric"],
    log,
    name: "ORDERS:service",
    resource: "instruments",
    table: instruments,
    url: refDataUrl,
  });

  const service = new DataService({ name: "ORDERS:service", port, log })
    .addPublisher(publisher)
    .addGenerator(generator)
    .addDependency(refData)
    .start();

  refData.firstSnapshot.then(() => {
    const { count, ms } = generator.createInitialOrders(initialOrderCount);
    log(`[ORDERS:service] created ${count} orders in ${ms}ms`);
    publisher.setReady();
    if (newOrdersPerSecond > 0) {
      generator.start(newOrdersPerSecond);
    }
  }, () => undefined);

  return { generator, instruments, orders, refData, service };
}
