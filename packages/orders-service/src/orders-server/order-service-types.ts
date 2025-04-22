import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

export interface RowCount {
  count: number;
}

export interface ParentOrders {
  parentOrders: VuuDataRow[];
}

export type OrdersData = ParentOrders;
