import { VuuAggregation, VuuAggType } from "@vuu-ui/vuu-protocol-types";
import { ColumnMap } from "@vuu-ui/vuu-utils";

export type AggregationCriterium = [number, VuuAggType, string];
export type AggregationCriteria = AggregationCriterium[];

export const mapAggregationCriteria = (
  aggregations: VuuAggregation[],
  columnMap: ColumnMap
): AggregationCriteria =>
  aggregations.map(({ column, aggType }) => [
    columnMap[column],
    aggType,
    column,
  ]);
