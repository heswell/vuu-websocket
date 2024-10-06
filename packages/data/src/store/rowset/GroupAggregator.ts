import { AggregationCriteria } from "../aggregationUtils";
import { SortSet } from "../sortUtils";
import { GroupedStruct } from "./GroupRowSet";

export class GroupAggregator {
  constructor(
    private sortSet: SortSet,
    private rows: Array<number[]>,
    private root: GroupedStruct,
    private aggregations: AggregationCriteria
  ) {}

  aggregate(groupedStruct: GroupedStruct = this.root) {
    const { aggregations, rows, sortSet } = this;
    aggregateGroup(groupedStruct, aggregations, sortSet, rows);
  }
}

function aggregateGroup(
  {
    aggregatedValues,
    groups,
    childCount,
    childGroupKeys,
    expanded,
    leafCount,
    leafRows,
  }: GroupedStruct,
  aggregations: AggregationCriteria,
  sortSet: SortSet,
  rows: number[][]
) {
  if (expanded) {
    for (
      let childGroupIndex = 0;
      childGroupIndex < childCount;
      childGroupIndex++
    ) {
      for (const [, , columnName] of aggregations) {
        aggregatedValues[columnName] = 0;
      }

      const groupValue = childGroupKeys[childGroupIndex];
      const childGroup = groups[groupValue];
      aggregateGroup(childGroup, aggregations, sortSet, rows);
      for (const [columnIndex, , columnName] of aggregations) {
        aggregatedValues[columnName] += childGroup.aggregatedValues[columnName];
      }
    }
  } else {
    for (const [, , columnName] of aggregations) {
      aggregatedValues[columnName] = 0;
    }

    for (let i = 0; i < leafCount; i++) {
      const leafIndex = leafRows[i];
      const [rowIndex] = sortSet[leafIndex];
      const row = rows[rowIndex];
      for (const [columnIndex, , columnName] of aggregations) {
        aggregatedValues[columnName] += row[columnIndex];
      }
    }
  }
}
