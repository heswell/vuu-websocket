import { TableDef } from "@heswell/vuu-server";

export const instruments = TableDef({
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
});

export const orders = TableDef({
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
});

export const childOrders = TableDef({
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
});

export const parentOrders = TableDef({
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
});

export const prices = TableDef({
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
});
