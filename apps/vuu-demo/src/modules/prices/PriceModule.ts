import { ModuleFactory } from "@heswell/vuu-server";
import { PricesProvider } from "./PricesProvider";
import { prices } from "./PriceTableDefs";

export const PricesModule = () =>
  ModuleFactory.withNameSpace("PRICES")
    .addTable(prices, (table) => new PricesProvider(table))
    .asModule();
