import { Column, Columns, TableDef } from "@heswell/vuu-server";
import { SchemaColumn } from "@vuu-ui/vuu-data-types";

const VUU_TIMESTAMP_COLUMNS: Column[] = [
  { name: "vuuCreatedTimestamp", dataType: "long" },
  { name: "vuuUpdatedTimestamp", dataType: "long" },
];

export const instruments = TableDef({
  // columns: Columns.fromNames(
  //   "bbg:string",
  //   "currency:string",
  //   "description:string",
  //   "exchange:string",
  //   "isin:string",
  //   "lotSize:int",
  //   "ric:string",
  // ),
  columns: [
    { name: "exchange", dataType: "string" },
    { name: "isin", dataType: "string" },
    { name: "lotSize", dataType: "int" },
    { name: "ric", dataType: "string" },
    ...VUU_TIMESTAMP_COLUMNS,
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
