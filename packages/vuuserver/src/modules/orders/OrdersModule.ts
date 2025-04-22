import ModuleContainer from "@heswell/vuu-module/src/ModuleContainer";
import { ParentOrdersProvider } from "./providers/ParentOrdersProvider";
import { parentOrders } from "./OrdersTableDefs";

ModuleContainer.withNameSpace("ORDERS")
  .addTable(parentOrders, (table) => new ParentOrdersProvider(table))
  .asModule();
