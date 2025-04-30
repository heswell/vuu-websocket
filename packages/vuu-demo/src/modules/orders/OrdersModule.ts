import { ParentOrdersProvider } from "./providers/ParentOrdersProvider";
import { parentOrders } from "./OrdersTableDefs";
import { ModuleContainer } from "@heswell/vuu-server";

ModuleContainer.withNameSpace("ORDERS")
  .addTable(parentOrders, (table) => new ParentOrdersProvider(table))
  .asModule();
