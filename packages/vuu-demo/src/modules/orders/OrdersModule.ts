import { ParentOrdersProvider } from "./providers/ParentOrdersProvider";
import { parentOrders, selectedParentOrders } from "./OrdersTableDefs";
import { Column, ModuleFactory, ViewPortDef } from "@heswell/vuu-server";
import { OrdersService } from "./services/OrdersService,";

export const OrdersModule = () =>
  ModuleFactory.withNameSpace("ORDERS")
    .addTable(
      parentOrders,
      (table) => new ParentOrdersProvider(table),
      (table, provider, providerContainer, tableContainer) =>
        ViewPortDef(
          table.schema.columns.map<Column>(
            ({ name, serverDataType: dataType }) => ({
              name,
              dataType,
            })
          ),
          new OrdersService(table, providerContainer, tableContainer)
        )
    )
    // .addSessionTable(selectedParentOrders)
    .asModule();
