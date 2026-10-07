import { VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import { RowUpdateType } from "./RowUpdateType";

export interface RowUpdate {
  data: readonly VuuRowDataItemType[];
  rowIndex: number;
  rowKey: string;
  sel: number;
  ts: number;
  updateType: RowUpdateType;
  viewPortId: string;
  vpSize: number;
  vpVersion: string;
}

// Plain object literal (rather than a class instance), JSON.stringify
// serializes these considerably faster.
export const RowUpdate = (
  vpVersion: string,
  viewPortId: string,
  vpSize: number,
  rowIndex: number,
  rowKey: string,
  updateType: RowUpdateType,
  ts: number,
  sel: number,
  data: readonly VuuRowDataItemType[],
): RowUpdate => ({
  vpVersion,
  viewPortId,
  vpSize,
  rowIndex,
  rowKey,
  updateType,
  ts,
  sel,
  data,
});
