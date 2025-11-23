import { Filter } from "@vuu-ui/vuu-filter-types";
import { VuuRange, VuuRow, VuuSortCol } from "@vuu-ui/vuu-protocol-types";

export interface DataResponse {
  rows: VuuRow[];
  size: number;
  sizeMessageRequired?: boolean;
}

export interface DataResponseSelectedRows extends DataResponse {
  selectedRowCount: number;
}

export interface IRowSet {
  currentRange(): DataResponse;
  filter: (filter: Filter) => void;
  selectRow: (rowKey: string) => DataResponseSelectedRows;
  deselectRow: (rowKey: string) => DataResponseSelectedRows;
  selectRowRange: (
    fromRowKey: string,
    toRowKey: string
  ) => DataResponseSelectedRows;
  setRange(
    range: VuuRange,
    useDelta?: boolean,
    includeStats?: boolean
  ): DataResponse;
  sort(sortDefs: VuuSortCol[]): void;
}
