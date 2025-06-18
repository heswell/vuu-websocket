import { VuuDataRow, VuuDataRowDto } from "@vuu-ui/vuu-protocol-types";

export interface HBMessage {
  ts: number;
  type: "HB";
}

export interface OrdersServiceDataMessage {
  data: VuuDataRow;
  tableName: "parentOrders";
  type: "insert" | "update";
}

export interface OrdersServiceBulkDataMessage {
  data: VuuDataRow[];
  tableName: "parentOrders";
  type: "bulk-insert";
}
export interface OrdersServiceBulkDataCompleteMessage {
  count: number;
  tableName: "parentOrders";
  type: "bulk-insert-complete";
}

export type OrdersServiceMessage =
  | OrdersServiceDataMessage
  | OrdersServiceBulkDataMessage
  | OrdersServiceBulkDataCompleteMessage
  | HBMessage;

export interface ParentOrderDto {
  id: string;
  side: string;
  status: "NEW" | "PARTIAL" | "FILLED" | "CANCELLED";
  ric: string;
  algo: string;
  ccy: string;
  quantity: number;
  filledQuantity: number;
  account: string;
  trader: string;
  created: number;
  lastUpdated: number;
  column13: number;
  column14: number;
  column15: number;
  column16: number;
  column17: number;
  column18: number;
  column19: number;
  column20: number;
  column21: number;
  column22: number;
  column23: number;
  column24: number;
  column25: number;
  column26: number;
  column27: number;
  column28: number;
  column29: number;
  column30: number;
  column31: number;
  column32: number;
  column33: number;
  column34: number;
  column35: number;
  column36: number;
  column37: number;
  column38: number;
  column39: number;
  column40: number;
}
