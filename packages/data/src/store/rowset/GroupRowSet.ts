import { Filter } from "@vuu-ui/vuu-filter-types";
import {
  VuuAggregation,
  VuuGroupBy,
  VuuRange,
  VuuRow,
  VuuSortCol,
} from "@vuu-ui/vuu-protocol-types";
import { BaseRowSet } from "./BaseRowSet";
import { RowSet } from "./rowSet";
import { DataResponse } from "./IRowSet";
import { SortSet } from "../sortUtils";
import {
  countExpandedChildNodes,
  countExpandedRows,
  countRows,
  createGroupVuuRow,
  findGroupedStructByKey,
  mapGroupByToSortCriteria,
} from "./group-utils";
import { UpdateTuples } from "../table";
import { GroupIterator } from "./GroupIterator";
import {
  AggregationCriteria,
  mapAggregationCriteria,
} from "../aggregationUtils";
import { GroupAggregator } from "./GroupAggregator";

export type Groups = { [key: string]: GroupedStruct };

export type GroupedStruct = {
  aggregatedValues: Record<string, number>;
  childCount: number;
  childGroupKeys: string[];
  depth: number;
  leafCount: number;
  expanded: boolean;
  groups: Groups;
  leafRows: number[];
};

export class GroupRowSet extends BaseRowSet {
  #aggregations: AggregationCriteria = [];
  #groupBy: VuuGroupBy;
  #groupedStruct: GroupedStruct = {
    aggregatedValues: {},
    childCount: 0,
    childGroupKeys: [],
    depth: 0,
    leafCount: 0,
    expanded: true,
    groups: {},
    leafRows: [],
  };
  #size = 0;

  filter(filter: Filter): void {
    throw new Error("Method 'filter' not implemented in GroupRowSet.");
  }

  clearFilter() {
    throw new Error("Method 'clearFilter' not implemented in GroupRowSet.");
  }

  sort(sortDefs: VuuSortCol[]): void {
    throw new Error("Method 'sort' not implemented in GroupRowSet.");
  }

  constructor(
    { columns, range, sortSet, table, viewportId }: RowSet,
    groupBy: VuuGroupBy
  ) {
    super(viewportId, table, columns);
    this.#groupBy = groupBy;
    this.sortSet = sortSet;
    this.range = range;

    this.applyGroupBy(groupBy);
  }

  toRowSet() {
    return new RowSet(this.viewportId, this.table, this.columns, {
      range: this.range,
      sortSet: this.sortSet,
    });
  }

  get size() {
    return this.#size;
  }

  set aggregations(aggregations: VuuAggregation[]) {
    const { columnMap } = this.table;
    this.#aggregations = mapAggregationCriteria(aggregations, columnMap);
    // TODO determine what has changed and perform minumum possible calculation
    this.applyAggregations();
  }

  set groupBy(groupBy: VuuGroupBy) {
    console.log(`set groupBy ${groupBy.join(",")}`);
    this.#groupBy = groupBy;
  }

  setRange(range: VuuRange, useDelta?: boolean): DataResponse {
    const { size, sortSet, table, viewportId } = this;
    const iterator = new GroupIterator(this.#groupedStruct);
    const rows: VuuRow[] = [];

    const createRow = createGroupVuuRow(
      viewportId,
      table,
      this.#groupBy,
      sortSet,
      size
    );

    const groupedItems = iterator.next(range);
    for (const groupedItem of groupedItems) {
      rows.push(createRow(groupedItem));
    }

    return {
      rows,
      size,
    };
  }

  currentRange() {
    const { range, size, sortSet, table, viewportId } = this;
    const iterator = new GroupIterator(this.#groupedStruct);
    const rows: VuuRow[] = [];

    const createRow = createGroupVuuRow(
      viewportId,
      table,
      this.#groupBy,
      sortSet,
      size
    );

    const groupedItems = iterator.next(range);
    for (const groupedItem of groupedItems) {
      rows.push(createRow(groupedItem));
    }

    return {
      rows,
      // important to reselect size here, it may have been updated
      size: this.size,
    };
  }

  openTreeNode(key: string) {
    const groupStruct = findGroupedStructByKey(this.#groupedStruct, key);

    if (groupStruct.expanded === false) {
      groupStruct.expanded = true;
      if (this.#groupBy.length > groupStruct.depth) {
        const { columnMap, rows } = this.table;
        const groupCriteria = mapGroupByToSortCriteria(
          this.#groupBy,
          columnMap
        );
        if (groupStruct.childCount === 0) {
          addNextLevelGroups(
            this.sortSet,
            rows as string[][],
            groupCriteria[groupStruct.depth][0],
            groupStruct
          );
          if (this.#aggregations.length > 0) {
            new GroupAggregator(
              this.sortSet,
              this.table.rows as number[][],
              this.#groupedStruct,
              this.#aggregations
            ).aggregate(groupStruct);
          }
        }

        const expandedRows = countExpandedRows(groupStruct);
        this.#size += expandedRows;
      } else {
        this.#size += groupStruct.leafCount;
      }
    } else {
      throw Error(`openTreeNode, node ${key} is already expanded`);
    }
  }

  closeTreeNode(key: string) {
    const groupStruct = findGroupedStructByKey(this.#groupedStruct, key);

    if (groupStruct.expanded === true) {
      groupStruct.expanded = false;
      this.#size -= countRows(groupStruct);
    } else {
      throw Error(`closeTreeNode, node ${key} is already collapsed`);
    }
  }

  get expandedChildNodeCount() {
    return countExpandedChildNodes(this.#groupedStruct);
  }

  update(rowIndex: number, updates: UpdateTuples) {
    throw new Error("Method 'update' not implemented in GroupRowSet.");
  }

  private applyAggregations() {
    const { rows } = this.table;
    const groupAggregator = new GroupAggregator(
      this.sortSet,
      rows as number[][],
      this.#groupedStruct,
      this.#aggregations
    );
    const start = performance.now();
    groupAggregator.aggregate();
    const end = performance.now();
    console.log(`aggregating ${rows.length} rows took ${end - start}ms`);
  }

  private applyGroupBy(groupBy: VuuGroupBy) {
    console.log(`applyGroupBy ${JSON.stringify(groupBy)}`);

    const { columnMap, rows } = this.table;
    const groupCriteria = mapGroupByToSortCriteria(groupBy, columnMap);

    const start = performance.now();
    buildTopLevelGroupedStruct(
      this.sortSet,
      rows as string[][],
      groupCriteria[0][0],
      this.#groupedStruct
    );
    this.#size = this.#groupedStruct.childCount;
    console.log(`size = ${this.#size}`);

    const end = performance.now();

    console.log(`grouping ${rows.length} rows took ${end - start}ms`);
    // console.log({ groupedStruct: this.#groupedStruct });
  }
}

export function buildTopLevelGroupedStruct(
  sortSet: SortSet,
  rows: Array<string[]>,
  groupbyColIdx: number,
  groupedStruct: GroupedStruct
) {
  const { depth, groups } = groupedStruct;
  for (let i = 0; i < rows.length; i++) {
    const rowIdx = sortSet[i][0];
    const groupValue = rows[rowIdx][groupbyColIdx];
    if (groups[groupValue] === undefined) {
      groups[groupValue] = {
        aggregatedValues: {},
        childCount: 0,
        childGroupKeys: [],
        depth: depth + 1,
        leafCount: 1,
        expanded: false,
        groups: {},
        leafRows: [rowIdx],
      };
      groupedStruct.childGroupKeys.push(groupValue);
      groupedStruct.childCount += 1;
    } else {
      groups[groupValue].leafCount += 1;
      groups[groupValue].leafRows.push(rowIdx);
    }
  }

  groupedStruct.childGroupKeys.sort();

  return groupedStruct;
}

export function addNextLevelGroups(
  sortSet: SortSet,
  rows: Array<string[]>,
  groupbyColIdx: number,
  groupedStruct: GroupedStruct
) {
  const { depth, groups, leafRows } = groupedStruct;
  groupedStruct.childCount = 0;

  for (let i = 0; i < leafRows.length; i++) {
    const leafRowIdx = leafRows[i];
    const rowIdx = sortSet[leafRowIdx][0];
    const groupValue = rows[rowIdx][groupbyColIdx];
    if (groups[groupValue] === undefined) {
      groups[groupValue] = {
        aggregatedValues: {},
        childCount: -1,
        childGroupKeys: [],
        depth: depth + 1,
        leafCount: 1,
        expanded: false,
        groups: {},
        leafRows: [rowIdx],
      };
      groupedStruct.childGroupKeys.push(groupValue);
      groupedStruct.childCount += 1;
    } else {
      groups[groupValue].leafCount += 1;
      groups[groupValue].leafRows.push(rowIdx);
    }
  }

  groupedStruct.childGroupKeys.sort();
}
