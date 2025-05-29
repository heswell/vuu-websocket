import { OrdersProvider } from "./providers/OrdersProvider";
import { orders } from "./OrdersTableDefs";
import { ModuleContainer } from "@heswell/vuu-server";

export const OrdersModule = () =>
  ModuleContainer.withNameSpace("ORDERS")
    .addTable(orders, (table) => new OrdersProvider(table))
    .asModule();
