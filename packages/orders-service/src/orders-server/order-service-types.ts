import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

export interface RowCount {
  count: number;
}

export interface orders {
  orders: VuuDataRow[];
}

export type OrdersData = orders;
