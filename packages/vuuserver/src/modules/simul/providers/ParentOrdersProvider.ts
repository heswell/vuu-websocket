import { Table } from "@heswell/data";
import { getRandom, Provider, random } from "@heswell/vuu-module";
import { Module } from "@heswell/vuu-module";
import { VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";

import { accounts } from "./reference-data/accounts";
import { orderStatus } from "./reference-data/orderStatus";
import { sides } from "./reference-data/sides";
import { algos } from "./reference-data/algos";

const parentOrderCount = 10000;
const averageChildPerOrder = 5;
const childMaxMultiple = 10;

export class ParentOrdersProvider extends Provider {
  constructor(table: Table) {
    super(table, ["instruments"]);
  }
  async load(module: Module) {
    const {
      columnMap: { currency, exchange, ric },
      rows: instruments,
    } = module.getTable("instruments");

    const row: Record<string, VuuRowDataItemType> = {};

    let parentOrderId = 0;

    for (let i = 0; i < parentOrderCount; i++) {
      parentOrderId += 1;

      const instrument = getRandom(instruments);
      const account = getRandom(accounts);
      const algo = getRandom(algos);
      const status = getRandom(orderStatus);
      const quantity = 1000 * random(1, 100);
      const filledQty =
        status === "FILLED"
          ? quantity
          : status === "NEW"
          ? 0
          : quantity - random(100, quantity);
      const openQty = quantity - filledQty;
      const side = getRandom(sides);

      const childCount = random(
        0,
        averageChildPerOrder * random(1, childMaxMultiple)
      );

      row.account = account;
      row.algo = algo;
      row.averagePrice = 0;
      row.ccy = instrument[currency];
      row.childCount = childCount;
      row.exchange = instrument[exchange];
      row.filledQty = filledQty;
      row.id = `${parentOrderId}`;
      row.idAsInt = parentOrderId;
      row.lastUpdate = "";
      row.openQty = openQty;
      row.price = 0;
      row.quantity = quantity;
      row.ric = instrument[ric];
      row.side = side;
      row.status = status;
      row.volLimit = 100;

      this.insertRow(row);
    }

    this.loaded = true;
  }
}
