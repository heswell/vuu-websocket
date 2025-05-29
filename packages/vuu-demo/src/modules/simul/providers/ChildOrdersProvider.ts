import { Table } from "@heswell/data";
import { Module, Provider } from "@heswell/vuu-server";
import { VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";

export class ChildOrdersProvider extends Provider {
  constructor(table: Table) {
    super(table, ["parentOrders"]);
  }
  async load(module: Module) {
    const {
      columnMap: { account, id, ccy, childCount, ric },
      rows: parentOrders,
    } = module.getTable("parentOrders");

    let childOrderId = 0;

    const row: Record<string, VuuRowDataItemType> = {};

    for (const parentOrder of parentOrders) {
      const count = parentOrder[childCount] as number;

      for (let i = 0; i < count; i++) {
        childOrderId += 1;

        row.account = parentOrder[account];
        row.averagePrice = "";
        row.ccy = parentOrder[ccy];
        row.exchange = "";
        row.filledQty = "";
        row.idAsInt = childOrderId;
        row.id = `${row.idAsInt}`;
        row.lastUpdate = "";
        row.openQty = "";
        row.parentOrderId = parentOrder[id];
        row.price = "";
        row.quantity = "";
        row.ric = parentOrder[ric];
        row.side = "";
        row.status = "";
        row.strategy = "";
        row.volLimit = "";

        this.insertRow(row);
      }
    }

    this.loaded = true;
  }
}
