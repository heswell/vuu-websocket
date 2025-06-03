import { Filter } from "@vuu-ui/vuu-filter-types";
import {
  VuuDataRow,
  VuuRange,
  VuuRow,
  VuuSortCol,
} from "@vuu-ui/vuu-protocol-types";
import { VuuDataRowWithMetaData } from "../columnUtils";

export type DataResponse = {
  rows: VuuRow[];
  size: number;
  sizeMessageRequired?: boolean;
};

export interface IRowSet {
  currentRange(): DataResponse;
  filter: (filter: Filter) => void;
  select: (selected: number[]) => DataResponse;
  setRange(
    range: VuuRange,
    useDelta?: boolean,
    includeStats?: boolean
  ): DataResponse;
  sort(sortDefs: VuuSortCol[]): void;
}
