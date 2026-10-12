import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import { RowUpdateType } from "./RowUpdateType";

export interface RowUpdate {
  data: VuuDataRow;
  rowIndex: number;
  rowKey: string;
  sel: 0 | 1;
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
  sel: 0 | 1,
  data: VuuDataRow,
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
