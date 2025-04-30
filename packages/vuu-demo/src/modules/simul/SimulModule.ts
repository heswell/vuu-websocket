import { InstrumentProvider } from "./providers/InstrumentProvider";
import { OrdersProvider } from "./providers/OrdersProvider";
import { PricesProvider } from "./providers/PricesProvider";
import { ChildOrdersProvider } from "./providers/ChildOrdersProvider";
import { ParentOrdersProvider } from "./providers/ParentOrdersProvider";
import { InstrumentService } from "./services/InstrumentService";
import {
  childOrders,
  instruments,
  orders,
  parentOrders,
  prices,
} from "./SimulTableDefs";
import { ModuleContainer } from "@heswell/vuu-server";

ModuleContainer.withNameSpace("SIMUL")
  .addTable(
    instruments,
    (table) => new InstrumentProvider(table),
    (table) => new InstrumentService(table)
  )
  .addTable(orders, (table) => new OrdersProvider(table))
  .addTable(childOrders, (table) => new ChildOrdersProvider(table))
  .addTable(parentOrders, (table) => new ParentOrdersProvider(table))
  .addTable(prices, (table) => new PricesProvider(table))
  .asModule();
