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
  countExpandedRows,
  countRows,
  createGroupVuuRow,
  extendsExistingGroupBy,
  findGroupedStructByKey,
  getLeafRow,
  GroupedItem,
  hasChanged,
  mapGroupByToSortCriteria,
  typeofGroupByChange,
} from "./group-utils";
import { GroupIterator } from "./GroupIterator";
import {
  AggregationCriteria,
  mapAggregationCriteria,
} from "../aggregationUtils";
import { GroupAggregator } from "./GroupAggregator";
import { identifySelectionChanges } from "../selectionUtils";

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
  // group metaData
  /**
   * Keeps count of number of expanded groups at each level. Easy to track
   * and allows us to efficiently determine whether an openTreeNode request
   * requires us to apply grouping. This will yield some false positives -
   * where a higher level node has been collapsed but descendant nodes were
   * expanded, these cann still trigger  a rerender. Not worth the expense of
   * detecting this though - a rerender isn't that expensive
   */
  #expandedGroupCount = new Map<number, number>();

  #groupBy: VuuGroupBy;
  #groupedStruct: GroupedStruct;
  #maxGroupedLevel = 1;
  // TODO how do we deal with these indices in the event of a sort or filter operation ?
  // we probably need to recompute them from the selected keys
  #selectedIndexValues: number[] = [];
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
    { columns, filterSet, range, sortSet, table, viewportId }: RowSet,
    groupBy: VuuGroupBy
  ) {
    super(viewportId, table, columns);
    this.filterSet = filterSet;
    this.#groupBy = groupBy;
    this.sortSet = sortSet;
    this.range = range;

    this.#groupedStruct = this.applyGroupBy(groupBy);
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

  /**
   * Some groupBy operations require nothing more than updating the
   * groupBy columns. Only when user expands a node to reveal nested
   * children do we need to lazily evaluate those child nodes.
   * Return false if no rendering action required.
   */
  setGroupBy(groupBy: VuuGroupBy): boolean {
    this.assertValidGroupBy(groupBy);

    const existingGroupBy = this.#groupBy;
    const change = typeofGroupByChange(this.#groupBy, groupBy);

    // If typeOfChange is 'modified', determine depth at which modification starts
    // might still be a no-op if no nodes are actually visible

    // ditto reduced

    this.#groupBy = groupBy;

    if (hasChanged(change) && change.depth === 1) {
      this.#groupedStruct = this.applyGroupBy(groupBy);
    } else if (extendsExistingGroupBy(change, existingGroupBy)) {
      const expandedGroupCount =
        this.#expandedGroupCount.get(groupBy.length - 1) ?? 0;
      if (expandedGroupCount === 0) {
        return false;
      }
    } else if (change.type === "modified") {
      this.#expandedGroupCount.clear();
      if (existingGroupBy[0] !== groupBy[0]) {
        this.#groupedStruct = this.applyGroupBy(groupBy);
      } else {
        if (this.#expandedGroupCount.get(1) === 0) {
          return false;
        }
        // need to regroup lower level, unless no parent nodes expanded in which case,
        // its another no-op
      }
    } else if (change.type === "reduced") {
      if (this.#maxGroupedLevel < change.depth) {
        return false;
      } else {
        this.#size += ungroup(this.#groupedStruct, change.depth - 1);
        for (let i = 1; i < change.depth; i++) {
          const expandedCount = this.#expandedGroupCount.get(i) ?? 0;
          if (expandedCount > 0) {
            return true;
          }
        }
        return false;
      }
    }
    return true;
  }

  setRange(range: VuuRange, useDelta?: boolean): DataResponse {
    const { size, sortSet, table, viewportId } = this;
    const iterator = new GroupIterator(this.#groupedStruct);
    const rows: VuuRow[] = [];
    this.range = range;

    // TODO what about filterSet
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

  select(selected: number[]): DataResponse {
    const { indexOfKeyField, range, size, sortSet, table, viewportId } = this;

    const iterator = new GroupIterator(this.#groupedStruct);
    const selectedGroupedItems = iterator.allByIndex(selected);
    const previouslySelectedGroupedItems = iterator.allByIndex(
      this.#selectedIndexValues
    );
    const keyMap: Record<string, GroupedItem> = {};

    const selectedKeyValues = selectedGroupedItems.map((groupedItem) => {
      if (groupedItem.leafIndex === -1) {
        keyMap[groupedItem.key] = groupedItem;
        return groupedItem.key;
      } else {
        const leafRow = getLeafRow(groupedItem, table.rows);
        const leafKey = leafRow[indexOfKeyField] as string;
        keyMap[leafKey] = groupedItem;
        return leafKey;
      }
    });
    previouslySelectedGroupedItems.forEach((groupedItem) => {
      if (groupedItem.leafIndex === -1) {
        keyMap[groupedItem.key] = groupedItem;
        return groupedItem.key;
      } else {
        const leafRow = getLeafRow(groupedItem, table.rows);
        const leafKey = leafRow[indexOfKeyField] as string;
        keyMap[leafKey] = groupedItem;
        return leafKey;
      }
    });

    // TODO need to find deselected values

    const { from, to } = range;

    const [newSelected, deselected] = identifySelectionChanges(
      this.selected,
      selectedKeyValues
    );
    this.selected = selectedKeyValues;
    this.#selectedIndexValues = selected;

    const updatedRows: VuuRow[] = [];

    const createRow = createGroupVuuRow(
      viewportId,
      table,
      this.#groupBy,
      sortSet,
      size
    );

    for (const key of newSelected) {
      const groupedItem = keyMap[key];
      if (groupedItem.index >= from && groupedItem.index < to) {
        updatedRows.push(createRow(groupedItem, true));
      }
    }

    for (const key of deselected) {
      const groupedItem = keyMap[key];
      // If this key is not in the map, it means a row that was previouskly selected
      // is no longer in the rowset (likely because a group has been closed)
      if (groupedItem?.index >= from && groupedItem?.index < to) {
        updatedRows.push(createRow(groupedItem));
      }
    }

    return {
      rows: updatedRows,
      size,
    };
  }

  private incrementGroupExpandedCount(depth: number) {
    const count = this.#expandedGroupCount.get(depth) ?? 0;
    this.#expandedGroupCount.set(depth, count + 1);
  }
  private decrementGroupExpandedCount(depth: number) {
    const count = this.#expandedGroupCount.get(depth) ?? 0;
    if (count > 0) {
      this.#expandedGroupCount.set(depth, count - 1);
    } else {
      throw Error("attempt to set expandedGroupCount below zero");
    }
  }

  openTreeNode(key: string) {
    const groupStruct = findGroupedStructByKey(this.#groupedStruct, key);
    const { depth, expanded } = groupStruct;
    if (depth === this.#maxGroupedLevel) {
      this.#maxGroupedLevel = depth + 1;
      console.log(`max Grouped Level is now ${this.#maxGroupedLevel}`);
    }
    if (expanded === false) {
      groupStruct.expanded = true;
      if (this.#groupBy.length > depth) {
        const { table } = this;
        if (groupStruct.childCount === 0) {
          const groupCriteria = mapGroupByToSortCriteria(
            this.#groupBy,
            table.columnMap
          );

          addNextLevelGroups(
            table.rows as string[][],
            groupCriteria[groupStruct.depth][0],
            groupStruct
          );
          if (this.#aggregations.length > 0) {
            new GroupAggregator(
              this.sortSet,
              table.rows as number[][],
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

      this.incrementGroupExpandedCount(depth);
    } else {
      throw Error(`openTreeNode, node ${key} is already expanded`);
    }
  }

  closeTreeNode(key: string) {
    const groupStruct = findGroupedStructByKey(this.#groupedStruct, key);

    if (groupStruct.expanded === true) {
      groupStruct.expanded = false;
      this.#size -= countRows(groupStruct);
      this.decrementGroupExpandedCount(groupStruct.depth);
    } else {
      throw Error(`closeTreeNode, node ${key} is already collapsed`);
    }
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
    this.assertValidGroupBy(groupBy);

    const groupedStruct: GroupedStruct = {
      aggregatedValues: {},
      childCount: 0,
      childGroupKeys: [],
      depth: 0,
      leafCount: 0,
      expanded: true,
      groups: {},
      leafRows: [],
    };

    const { columnMap, rows } = this.table;
    const groupCriteria = mapGroupByToSortCriteria(groupBy, columnMap);

    const start = performance.now();
    buildTopLevelGroupedStruct(
      this.filterSet,
      this.sortSet,
      rows as string[][],
      groupCriteria[0][0],
      groupedStruct
    );
    this.#size = groupedStruct.childCount;
    console.log(`size = ${this.#size}`);

    const end = performance.now();

    console.log(`grouping ${rows.length} rows took ${end - start}ms`);
    // console.log({ groupedStruct: this.#groupedStruct });
    return groupedStruct;
  }

  private assertValidGroupBy(groupBy: VuuGroupBy) {
    const columnMissing = (n: string) =>
      this.columns.find((c) => c.name === n) === undefined;

    if (!Array.isArray(groupBy) || groupBy.some(columnMissing)) {
      throw Error(`GroupBy contains invalid column(s) ${groupBy.join(",")}`);
    }
  }
}

function ungroup(groupedStruct: GroupedStruct, depth: number): number {
  let sizeDiff = 0;
  if (groupedStruct.depth === depth) {
    if (groupedStruct.childCount > 0) {
      sizeDiff = groupedStruct.leafCount - groupedStruct.childCount;
      groupedStruct.groups = {};
      groupedStruct.childCount = 0;
      groupedStruct.childGroupKeys.length = 0;
    }
  } else if (groupedStruct.depth < depth) {
    for (const groupValue of groupedStruct.childGroupKeys) {
      sizeDiff += ungroup(groupedStruct.groups[groupValue], depth);
    }
  } else {
    throw Error("cannot ungroup a groupedStruct deeper than the ungroup level");
  }

  return sizeDiff;
}

export function buildTopLevelGroupedStruct(
  filterSet: number[] | undefined,
  sortSet: SortSet,
  rows: Array<string[]>,
  groupbyColIdx: number,
  groupedStruct: GroupedStruct
) {
  const getRowIndex = (i: number) => {
    const sortItem = filterSet ? sortSet[filterSet[i]] : sortSet[i];
    return sortItem[0];
  };

  const indexSet = filterSet ?? sortSet;
  const { depth, groups } = groupedStruct;
  for (let i = 0; i < indexSet.length; i++) {
    const rowIdx = getRowIndex(i);
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
  rows: Array<string[]>,
  groupbyColIdx: number,
  groupedStruct: GroupedStruct
) {
  const { depth, groups, leafRows } = groupedStruct;
  groupedStruct.childCount = 0;

  for (let i = 0; i < leafRows.length; i++) {
    const leafRowIdx = leafRows[i];
    const groupValue = rows[leafRowIdx][groupbyColIdx];
    if (groups[groupValue] === undefined) {
      groups[groupValue] = {
        aggregatedValues: {},
        childCount: 0,
        childGroupKeys: [],
        depth: depth + 1,
        leafCount: 1,
        expanded: false,
        groups: {},
        leafRows: [leafRowIdx],
      };
      groupedStruct.childGroupKeys.push(groupValue);
      groupedStruct.childCount += 1;
    } else {
      groups[groupValue].leafCount += 1;
      groups[groupValue].leafRows.push(leafRowIdx);
    }
  }

  groupedStruct.childGroupKeys.sort();
}
