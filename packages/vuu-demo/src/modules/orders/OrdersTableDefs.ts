import { type TableDef } from "@heswell/vuu-server";

export const parentOrders: TableDef = {
  columns: [
    { name: "id", dataType: "string" },
    { name: "side", dataType: "string" },
    { name: "status", dataType: "string" },
    { name: "ric", dataType: "string" },
    { name: "algo", dataType: "string" },
    { name: "ccy", dataType: "string" },
    { name: "quantity", dataType: "double" },
    { name: "filledQuantity", dataType: "double" },
    { name: "account", dataType: "string" },
    { name: "trader", dataType: "string" },
    { name: "created", dataType: "long" },
    { name: "lastUpdated", dataType: "long" },
  ],
  joinFields: "ric",
  keyField: "id",
  name: "parentOrders",
};

export const childOrders: TableDef = {
  columns: [
    { name: "id", dataType: "string" },
    { name: "parentOrderId", dataType: "string" },
    { name: "side", dataType: "string" },
    { name: "status", dataType: "string" },
    { name: "ric", dataType: "string" },
    { name: "orderType", dataType: "string" },
    { name: "exchange", dataType: "string" },
    { name: "ccy", dataType: "string" },
    { name: "quantity", dataType: "double" },
    { name: "filledQuantity", dataType: "double" },
    { name: "averagePrice", dataType: "double" },
    { name: "created", dataType: "long" },
    { name: "lastUpdated", dataType: "long" },
  ],
  joinFields: "ric",
  links: [
    { toTable: "parentOrders", fromColumn: "parentOrderId", toColumn: "id" },
  ],
  keyField: "id",
  name: "childOrders",
};

export const fills: TableDef = {
  columns: [
    { name: "id", dataType: "string" },
    { name: "childOrderId", dataType: "string" },
    { name: "parentOrderId", dataType: "string" },
    { name: "price", dataType: "double" },
    { name: "ccy", dataType: "string" },
    { name: "exchange", dataType: "string" },
    { name: "quantity", dataType: "double" },
    { name: "created", dataType: "long" },
  ],
  keyField: "id",
  links: [
    { toTable: "childOrders", fromColumn: "childOrderId", toColumn: "id" },
    {
      toTable: "parentOrders",
      fromColumn: "parentOrderId",
      toColumn: "id",
    },
  ],
  name: "fills",
};
