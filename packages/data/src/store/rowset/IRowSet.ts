import { Filter } from "@vuu-ui/vuu-filter-types";
import { VuuDataRow, VuuRange, VuuSortCol } from "@vuu-ui/vuu-protocol-types";

export type DataResponse = {
  offset: number;
  range: VuuRange;
  rows: VuuDataRow[];
  size: number;
};

export interface IRowSet {
  currentRange(): DataResponse;
  filter: (filter: Filter) => number;
  setRange(
    range: VuuRange,
    useDelta?: boolean,
    includeStats?: boolean
  ): DataResponse;
  sort(sortDefs: VuuSortCol[]): void;
}
