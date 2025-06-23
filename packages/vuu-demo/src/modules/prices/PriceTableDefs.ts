import { TableDef } from "@heswell/vuu-server";

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
