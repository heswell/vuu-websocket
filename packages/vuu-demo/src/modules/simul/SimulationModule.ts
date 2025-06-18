import { InstrumentProvider } from "./providers/InstrumentProvider";
import { OrdersProvider } from "./providers/OrdersProvider";
import { PricesProvider } from "./providers/PricesProvider";
import { ChildOrdersProvider } from "./providers/ChildOrdersProvider";
import { ParentOrdersProvider } from "./providers/ParentOrdersProvider";
import { InstrumentService } from "./services/InstrumentService";
import { ModuleFactory } from "@heswell/vuu-server";
import {
  childOrders,
  instruments,
  orders,
  parentOrders,
  prices,
} from "./SimulTableDefs";
import {
  columnUtils as Columns,
  Join as JoinTo,
  JoinSpec,
  JoinTableDef,
} from "@heswell/vuu-server";

export const SimulationModule = () =>
  ModuleFactory.withNameSpace("SIMUL")
    .addTable(
      instruments,
      (table) => new InstrumentProvider(table),
      (table) => new InstrumentService(table)
    )
    // .addTable(orders, (table) => new OrdersProvider(table))
    // .addTable(childOrders, (table) => new ChildOrdersProvider(table))
    // .addTable(parentOrders, (table) => new ParentOrdersProvider(table))
    .addTable(prices, (table) => new PricesProvider(table))
    // .addJoinTable((tableDefs) =>
    //   JoinTableDef({
    //     name: "instrumentPrices",
    //     baseTable: tableDefs.get("SIMUL", "instruments"),
    //     joinColumns: Columns.allFrom(
    //       tableDefs.get("SIMUL", "instruments")
    //     ).concat(
    //       Columns.allFromExcept(tableDefs.get("SIMUL", "prices"), "ric")
    //     ),
    //     joins: JoinTo(
    //       tableDefs.get("SIMUL", "prices"),
    //       JoinSpec("ric", "ric", "LeftOuterJoin")
    //     ),
    //   })
    // )
    .asModule();
