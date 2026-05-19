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

class RowUpdateImpl implements RowUpdate {
  constructor(
    public vpVersion: string,
    public viewPortId: string,
    public vpSize: number,
    public rowIndex: number,
    public rowKey: string,
    public updateType: RowUpdateType,
    public ts: number,
    public sel: number,
    public data: readonly VuuRowDataItemType[],
  ) {}
}

export const RowUpdate = (
  vpVersion: string,
  viewPortId: string,
  vpSize: number,
  rowIndex: number,
  rowKey: string,
  updateType: RowUpdateType,
  ts: number,
  selected: number,
  data: readonly VuuRowDataItemType[],
): RowUpdate =>
  new RowUpdateImpl(
    vpVersion,
    viewPortId,
    vpSize,
    rowIndex,
    rowKey,
    updateType,
    ts,
    selected,
    data,
  );
