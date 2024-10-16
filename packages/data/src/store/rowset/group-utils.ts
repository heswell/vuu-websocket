import { VuuGroupBy, VuuRow } from "@vuu-ui/vuu-protocol-types";
import type { GroupedStruct, Groups } from "./GroupRowSet";
import { ColumnMap } from "@vuu-ui/vuu-utils";
import { ASC, SortCriteria, SortSet } from "../sortUtils";
import { Table } from "../table";

export type GroupedItem = {
  index: number;
  group: GroupedStruct;
  groupValue: string;
  key: string;
  leafIndex: number;
};

export type CursorPosition = {
  groupIndex: number[];
  leafIndex: number;
  index: number;
};

export const NO_GROUPS: Groups = {} as const;

export const extractKeyValues = (key: string) => key.split("|").slice(1);

export function findGroupedStructAtIndex(
  { childGroupKeys, groups }: GroupedStruct,
  index: number[],
  key = "$root"
): [string, string, GroupedStruct] {
  const [idx] = index;
  const groupValue = childGroupKeys[idx];
  const group = groups[groupValue];
  const groupKey = `${key}|${groupValue}`;
  if (index.length === 1) {
    return [groupKey, groupValue, group];
  } else {
    return findGroupedStructAtIndex(group, index.slice(1), groupKey);
  }
}

export function findGroupedStructByKey(
  { groups }: GroupedStruct,
  key: string | string[]
): GroupedStruct {
  const [root, ...keys] = Array.isArray(key) ? key : extractKeyValues(key);

  console.log(`open Tree node [${[root].concat(keys).join("|")}]`);

  const groupedStruct = groups[root];
  if (groupedStruct) {
    if (keys.length === 0) {
      return groupedStruct;
    } else {
      return findGroupedStructByKey(groupedStruct, keys);
    }
  } else {
    throw Error(`key not found ${key}`);
  }
}

export const groupByExtendsExistingGroupBy = (
  currentGroupBy: VuuGroupBy,
  newGroupBy: VuuGroupBy
) =>
  currentGroupBy.length > 0 &&
  newGroupBy.length > currentGroupBy.length &&
  currentGroupBy.every((val, i) => newGroupBy[i] === val);

// doesn't care from which position col is removed, as long as it is not the first
export const groupbyReducesExistingGroupby = (
  currentGroupby: VuuGroupBy,
  newGroupby: VuuGroupBy
) =>
  currentGroupby.length > newGroupby.length &&
  newGroupby[0][0] === currentGroupby[0][0] &&
  newGroupby.every(([key]) => currentGroupby.find(([key2]) => key2 === key));

export const mapGroupByToSortCriteria = (
  groupBy: VuuGroupBy,
  columnMap: ColumnMap
): SortCriteria => groupBy.map((column) => [columnMap[column], ASC]);

export const buildGroupDataColumnMap = (tableColumnMap: ColumnMap) => {
  const tableColumnMapEntries = Object.entries(tableColumnMap);
  return tableColumnMapEntries.reduce<ColumnMap>(
    (columnMap, [key, value]) => ({
      ...columnMap,
      [key]: value + 6,
    }),
    {
      DEPTH: 0,
      EXPANDED: 1,
      PATH: 2,
      LEAF: 3,
      LABEL: 4,
      COUNT: 5,
      columnCount: tableColumnMapEntries.length + 6,
    }
  );
};

const isExpanded = ({ expanded }: GroupedStruct) => expanded;

export const countRows = ({
  childGroupKeys,
  childCount,
  groups,
  leafCount,
}: GroupedStruct): number => {
  if (childCount !== -1) {
    return childGroupKeys.reduce((count, key) => {
      const group = groups[key];
      if (group.expanded) {
        return count + 1 + countRows(group);
      } else {
        return count + 1;
      }
    }, 0);
  } else if (leafCount !== -1) {
    return leafCount;
  } else {
    return 0;
  }
};

/**
 * This function just counts direct children, used to determine
 * whether an extension to the existing group criteria is a no-op
 */
export const countExpandedChildNodes = ({
  childGroupKeys,
  groups,
}: GroupedStruct) => {
  const expandedEntries = childGroupKeys.filter((key) => groups[key].expanded);
  if (expandedEntries.length === 0) {
    return 0;
  } else {
    return expandedEntries.length;
  }
};

/**
 * Count the total number of rows exposed by the current expanded node
 */
export const countExpandedRows = ({
  childCount,
  childGroupKeys,
  groups,
  leafCount,
}: GroupedStruct) => {
  const expandedEntries = childGroupKeys.filter((key) => groups[key].expanded);
  if (expandedEntries.length === 0) {
    return childCount || leafCount;
  } else {
    return childGroupKeys.reduce((count, key): number => {
      count += 1;
      const group = groups[key];
      if (group.expanded) {
        if (group.childCount > 0) {
          return count + countExpandedRows(group);
        } else if (group.leafCount > 0) {
          return count + group.leafCount;
        }
      }
      return count;
    }, 0);
  }
};

export type GroupData = Array<string | number | boolean | null>;

export const createGroupVuuRow = (
  viewPortId: string,
  { columnMap, rows, schema }: Table,
  groupBy: VuuGroupBy,
  sortSet: SortSet,
  vpSize: number
) => {
  const groupRowColumnMap = buildGroupDataColumnMap(columnMap);
  const groupCriteria = mapGroupByToSortCriteria(groupBy, groupRowColumnMap);
  const keyColIndex = columnMap[schema.key];
  const dataRowColumns = Object.entries(columnMap);

  return ({ group, index, key, leafIndex }: GroupedItem) => {
    const { columnCount, COUNT, DEPTH, EXPANDED, LEAF } = groupRowColumnMap;

    const data = Array(columnCount).fill("");
    let leafRowKey = "";

    if (leafIndex !== -1) {
      data[DEPTH] = groupBy.length + 1;
      data[COUNT] = 0;
      data[LEAF] = true;
      data[EXPANDED] = false;
      const sortSetIdx = group.leafRows[leafIndex];
      const [rowIndex] = sortSet[sortSetIdx];
      const leafRow = rows[rowIndex];
      const leafRowkey = leafRow[keyColIndex];
      leafRowKey = `|${leafRowkey}`;
      for (const [columnName, rowIdx] of dataRowColumns) {
        data[groupRowColumnMap[columnName]] = leafRow[rowIdx];
      }
    } else {
      data[DEPTH] = group.depth;
      data[COUNT] = group.leafCount;
      data[LEAF] = false;
      data[EXPANDED] = group.expanded;

      const keyValues = extractKeyValues(key);
      for (let i = 0; i < keyValues.length; i++) {
        const [groupColumnIdx] = groupCriteria[i];
        data[groupColumnIdx] = keyValues[i];
      }

      for (const [columnName, value] of Object.entries(
        group.aggregatedValues
      )) {
        const columnIdx = groupRowColumnMap[columnName];
        data[columnIdx] = value;
      }
    }

    return {
      rowIndex: index,
      rowKey: `${key}${leafRowKey}`,
      sel: 0,
      ts: +new Date(),
      updateType: "U",
      viewPortId,
      vpSize,
      vpVersion: "",
      data,
    } as VuuRow;
  };
};

// export const incrementLastIndex = (index: number[]) => {
//   let lastIndex = index.pop() as number;
//   lastIndex += 1;
//   index.push(lastIndex);
//   return lastIndex;
// };

export const findCursorPosition = (
  { childGroupKeys, groups }: GroupedStruct,
  index: number,
  { groupIndex, index: pos, leafIndex }: CursorPosition = {
    groupIndex: [],
    leafIndex: -1,
    index: -1,
  }
): CursorPosition => {
  for (let i = 0; i < childGroupKeys.length; i++) {
    const groupValue = childGroupKeys[i];
    const group = groups[groupValue];

    pos += 1;
    leafIndex = -1;
    groupIndex.push(i);

    if (pos === index) {
      break;
    }

    if (group.expanded) {
      const expandedNodeCount = countExpandedRows(group);
      console.log(`expanded node count ${expandedNodeCount}`);
      if (pos + expandedNodeCount < index) {
        pos += expandedNodeCount;
        groupIndex.pop();
      } else if (group.childCount) {
        ({ index, leafIndex } = findCursorPosition(group, index, {
          groupIndex,
          index: pos,
          leafIndex,
        }));
        break;
      } else if (group.leafCount) {
        leafIndex = index - pos - 2;
        break;
      }
    } else {
      groupIndex.pop();
    }
  }

  return {
    groupIndex,
    leafIndex,
    index,
  };
};
