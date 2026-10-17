import type { DataTable } from "@heswell/vuu-server";
import type { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

export const createTradingConstituent = (
  tradingTable: DataTable,
  basket: VuuDataRow,
  ric: string,
  description: string,
  weighting: number,
): VuuDataRow => {
  const instanceId = basket[tradingTable.columnMap.instanceId];
  return [
    "", "",
    basket[tradingTable.columnMap.basketId],
    description,
    instanceId,
    `${instanceId}-${ric}`,
    95, 0, 0, 0, 0, 2,
    Math.trunc(weighting * Number(basket[tradingTable.columnMap.units])),
    ric, "BUY", "OFF-MARKET", "venue", weighting, "PENDING", 0,
  ];
};
