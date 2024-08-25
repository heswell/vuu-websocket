import { VuuDataRow, VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";

export type VuuDataRowWithAtLeastOneValue = [
  VuuRowDataItemType,
  ...VuuRowDataItemType[]
];

export const hasAtLeastOneValue = (
  row: VuuDataRow
): row is VuuDataRowWithAtLeastOneValue => row.length > 0;
