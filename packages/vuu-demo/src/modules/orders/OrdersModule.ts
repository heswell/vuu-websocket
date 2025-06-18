import { ParentOrdersProvider } from "./providers/ParentOrdersProvider";
import { parentOrders } from "./OrdersTableDefs";
import { ModuleFactory } from "@heswell/vuu-server";

export const OrdersModule = () =>
  ModuleFactory.withNameSpace("ORDERS")
    .addTable(parentOrders, (table) => new ParentOrdersProvider(table))
    .asModule();
