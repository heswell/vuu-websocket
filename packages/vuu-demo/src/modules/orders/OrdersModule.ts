import { ParentOrdersProvider } from "./providers/ParentOrdersProvider";
import { orders } from "./OrdersTableDefs";
import { ModuleContainer } from "@heswell/vuu-server";

export const OrdersModule = () =>
  ModuleContainer.withNameSpace("ORDERS")
    .addTable(orders, (table) => new ParentOrdersProvider(table))
    .asModule();
