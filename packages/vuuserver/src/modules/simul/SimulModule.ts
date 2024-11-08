import ModuleContainer from "@heswell/vuu-module";
import { InstrumentProvider } from "./providers/InstrumentProvider";
import { OrdersProvider } from "./providers/OrdersProvider";
import { PricesProvider } from "./providers/PricesProvider";
import { ChildOrdersProvider } from "./providers/ChildOrdersProvider";
import { ParentOrdersProvider } from "./providers/ParentOrdersProvider";
import { InstrumentService } from "./services/InstrumentService";

ModuleContainer.withNameSpace("SIMUL")
  .addTable(
    {
      columns: [
        { name: "bbg", dataType: "string" },
        { name: "currency", dataType: "string" },
        { name: "description", dataType: "string" },
        { name: "exchange", dataType: "string" },
        { name: "isin", dataType: "string" },
        { name: "lotSize", dataType: "int" },
        { name: "ric", dataType: "string" },
      ],
      joinFields: "ric",
      keyField: "ric",
      name: "instruments",
    },
    (table) => new InstrumentProvider(table),
    (table) => new InstrumentService(table)
  )
  .addTable(
    {
      columns: [
        { name: "status", dataType: "string" },
        { name: "ccy", dataType: "string" },
        { name: "created", dataType: "long" },
        { name: "filledQuantity", dataType: "double" },
        { name: "lastUpdate", dataType: "long" },
        { name: "orderId", dataType: "string" },
        { name: "quantity", dataType: "double" },
        { name: "ric", dataType: "string" },
        { name: "side", dataType: "string" },
        { name: "trader", dataType: "string" },
      ],
      joinFields: "ric",
      links: [
        { toTable: "instruments", fromColumn: "ric", toColumn: "ric" },
        { toTable: "prices", fromColumn: "ric", toColumn: "ric" },
      ],
      keyField: "orderId",
      name: "orders",
    },
    (table) => new OrdersProvider(table)
  )
  .addTable(
    {
      columns: [
        { name: "account", dataType: "string" },
        { name: "averagePrice", dataType: "double" },
        { name: "ccy", dataType: "string" },
        { name: "exchange", dataType: "string" },
        { name: "filledQty", dataType: "double" },
        { name: "id", dataType: "string" },
        { name: "idAsInt", dataType: "int" },
        { name: "lastUpdate", dataType: "long" },
        { name: "openQty", dataType: "double" },
        { name: "parentOrderId", dataType: "string" },
        { name: "price", dataType: "double" },
        { name: "quantity", dataType: "double" },
        { name: "ric", dataType: "string" },
        { name: "side", dataType: "string" },
        { name: "status", dataType: "string" },
        { name: "strategy", dataType: "string" },
        { name: "volLimit", dataType: "int" },
      ],
      joinFields: "ric",
      keyField: "id",
      links: [
        { toTable: "instruments", fromColumn: "ric", toColumn: "ric" },
        {
          toTable: "parentOrders",
          fromColumn: "parentOrderId",
          toColumn: "id",
        },
        { toTable: "prices", fromColumn: "ric", toColumn: "ric" },
      ],
      name: "childOrders",
    },
    (table) => new ChildOrdersProvider(table)
  )
  .addTable(
    {
      columns: [
        { name: "account", dataType: "string" },
        { name: "algo", dataType: "string" },
        { name: "averagePrice", dataType: "double" },
        { name: "ccy", dataType: "string" },
        { name: "childCount", dataType: "int" },
        { name: "exchange", dataType: "string" },
        { name: "filledQty", dataType: "double" },
        { name: "id", dataType: "string" },
        { name: "idAsInt", dataType: "int" },
        { name: "lastUpdate", dataType: "long" },
        { name: "openQty", dataType: "double" },
        { name: "price", dataType: "double" },
        { name: "quantity", dataType: "double" },
        { name: "ric", dataType: "string" },
        { name: "side", dataType: "string" },
        { name: "status", dataType: "string" },
        { name: "volLimit", dataType: "int" },
      ],
      keyField: "id",
      links: [
        { toTable: "instruments", fromColumn: "ric", toColumn: "ric" },
        { toTable: "prices", fromColumn: "ric", toColumn: "ric" },
      ],

      name: "parentOrders",
    },
    (table) => new ParentOrdersProvider(table)
  )
  .addTable(
    {
      columns: [
        { name: "ask", dataType: "double" },
        { name: "askSize", dataType: "double" }, // type: "int"
        { name: "bid", dataType: "double" },
        { name: "bidSize", dataType: "double" },
        { name: "close", dataType: "double" },
        { name: "last", dataType: "double" },
        { name: "open", dataType: "double" },
        { name: "phase", dataType: "string" },
        { name: "ric", dataType: "string" },
        { name: "scenario", dataType: "string" },
      ],
      joinFields: "ric",
      keyField: "ric",
      name: "prices",
    },
    (table) => new PricesProvider(table)
  )
  .asModule();
