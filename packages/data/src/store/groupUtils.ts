import {
  VuuDataRow,
  VuuGroupBy,
  VuuRowDataItemType,
} from "@vuu-ui/vuu-protocol-types";
import { ColumnMetaData, metaData } from "./columnUtils.ts";
import {
  GROUP_ROW_TEST,
  sortBy,
  SortCriteria,
  SortCriterium,
  sortPosition,
} from "./sortUtils.ts";
import { TableColumn } from "@heswell/server-types";
import { ColumnMap } from "@vuu-ui/vuu-utils";

// const DEFAULT_OPTIONS = {
//   startIdx: 0,
//   rootIdx: null,
//   rootExpanded: true,
//   baseGroupby: [],
// };

export function lowestIdxPointer(
  groups: VuuDataRow[],
  IDX: number,
  DEPTH: number,
  start: number,
  depth: number
) {
  let result = Number.MAX_SAFE_INTEGER;
  for (let i = start; i < groups.length; i++) {
    const group = groups[i];
    const absDepth = Math.abs(group[DEPTH] as number);

    if (absDepth > depth) {
      break;
    } else if (absDepth === depth) {
      const idx = group[IDX];
      if (typeof idx === "number" && idx < result) {
        result = idx;
      }
    }
  }

  return result === Number.MAX_SAFE_INTEGER ? undefined : result;
}

export const getCount = (groupRow: VuuDataRow, PRIMARY_COUNT: number) =>
  groupRow[PRIMARY_COUNT] as number;

const itemIsNumeric = (item: unknown) => !isNaN(parseInt(item as string, 10));
const numerically = (a: string, b: string) => parseInt(a) - parseInt(b);

function byKey([key1]: GroupStateChange, [key2]: GroupStateChange) {
  return key1 > key2 ? 1 : key2 > key1 ? -1 : 0;
}

const EMPTY = {};

type GroupState = { [key: string]: null | GroupState };

type GroupStateChange = [string, number, boolean];

export function getGroupStateChanges(
  groupState: GroupState,
  existingGroupState: GroupState | null = null,
  baseKey = "",
  groupIdx = 0
): GroupStateChange[] {
  const results: GroupStateChange[] = [];

  const entries = Object.entries(groupState);

  entries.forEach(([key, value]) => {
    if (value && (existingGroupState === null || !existingGroupState[key])) {
      results.push([baseKey + key, groupIdx, true]);
      if (
        value !== null &&
        typeof value === "object" &&
        Object.keys(value).length > 0
      ) {
        const diff = getGroupStateChanges(
          value,
          EMPTY,
          baseKey + key + "/",
          groupIdx + 1
        );
        if (diff.length) {
          results.push(...diff);
        }
      }
    } else if (value) {
      const diff = getGroupStateChanges(
        value,
        existingGroupState?.[key],
        baseKey + key + "/",
        groupIdx + 1
      );
      if (diff.length) {
        results.push(...diff);
      }
    }
  });

  if (existingGroupState !== null && typeof existingGroupState === "object") {
    Object.entries(existingGroupState).forEach(([key, value]) => {
      if (value && !groupState[key]) {
        results.push([baseKey + key, groupIdx, false]);
      }
    });
  }

  return results.sort(byKey);
}

export function indexOfCol(key: string, groupBy: VuuGroupBy | null): number;
export function indexOfCol(key: number, groupBy: SortCriteria | null): number;
export function indexOfCol(
  key: unknown,
  groupBy: VuuGroupBy | SortCriteria | null = null
) {
  if (groupBy !== null) {
    for (let i = 0; i < groupBy.length; i++) {
      const [col1] = groupBy[i];
      if (col1 === key) {
        return i;
      }
    }
  }
  return -1;
}

export function allGroupsExpanded(
  groupRows: VuuDataRow[],
  groupRow: VuuDataRow,
  { DEPTH, PARENT_IDX }: ColumnMetaData
) {
  do {
    if ((groupRow[DEPTH] as number) < 0) {
      return false;
    }
    groupRow = groupRows[groupRow[PARENT_IDX] as number];
  } while (groupRow);

  return true;
}

export function adjustGroupIndices(
  groupRows: VuuDataRow[],
  grpIdx: number,
  { IDX, DEPTH, IDX_POINTER, PARENT_IDX }: ColumnMetaData,
  adjustment = 1
) {
  for (let i = 0; i < groupRows.length; i++) {
    if ((groupRows[i][IDX] as number) >= grpIdx) {
      const groupRowIdx = groupRows[i][IDX] as number;
      groupRows[i][IDX] = groupRowIdx + adjustment;
      if (Math.abs(groupRows[i][DEPTH] as number) > 1) {
        const groupRowIdx = groupRows[i][IDX_POINTER] as number;
        groupRows[i][IDX_POINTER] = groupRowIdx + adjustment;
      }
      let parentIdx = groupRows[i][PARENT_IDX] as number;
      if (parentIdx !== null && parentIdx >= grpIdx) {
        groupRows[i][PARENT_IDX] = parentIdx + adjustment;
      }
    }
  }
}

function buildGroupKey(groupCriteria: SortCriteria, row: VuuDataRow) {
  const extractKey = ([idx]: SortCriterium) => row[idx] as number;
  return groupCriteria.map(extractKey).join("/");
}

export type LeafEntry = number[];
export type GroupEntry = GroupEntries | LeafEntry;
export type GroupEntries = {
  [key: string | number]: GroupEntry;
};

export function decrementDepth(depth: number) {
  return (Math.abs(depth) - 1) * (depth < 0 ? -1 : 1);
}

export function incrementDepth(depth: number) {
  return (Math.abs(depth) + 1) * (depth < 0 ? -1 : 1);
}

// hardcode the index ref for now
// When we build the group index, all groups are collapsed
export function indexGroupedRows(groupRows: VuuDataRow[]) {
  // TODO
  const Fields = {
    Depth: 1,
    Key: 4,
  };

  type level = [number, number];
  const groupedIndex: { [key: string]: unknown } = {};
  const levels: level[] = [];
  const COLLAPSED = -1;

  for (let idx = 0; idx < groupRows.length; idx++) {
    let row = groupRows[idx];
    let rowDepth = row[Fields.Depth] as number;

    if (rowDepth === 0) {
      let index = [idx];
      levels.forEach((level) => {
        index.push(level[1], COLLAPSED);
      });
      const key = row[Fields.Key] as string;
      groupedIndex[key] = index;
    } else {
      while (
        levels.length &&
        Math.abs(levels[levels.length - 1][0]) <= Math.abs(rowDepth)
      ) {
        levels.pop();
      }
      levels.push([rowDepth, idx]);
    }
  }

  return groupedIndex;
}

export function findAggregatedColumns(
  columns: TableColumn[],
  columnMap: ColumnMap,
  groupBy: VuuGroupBy
) {
  return columns.reduce((aggregations, column) => {
    if (column.aggregate && indexOfCol(column.name, groupBy) === -1) {
      const colIdx = columnMap[column.name];
      aggregations.push([colIdx, column.aggregate]);
    }
    return aggregations;
  }, [] as [number, "avg" | "sum"][]);
}

export function aggregateGroup(
  groupRows: VuuDataRow[],
  grpIdx: number,
  sortSet: number[],
  rows: VuuDataRow[],
  columns: TableColumn[],
  aggregations: [number, "avg" | "sum"][]
) {
  const { DEPTH, COUNT } = metaData(columns);
  const groupRow = groupRows[grpIdx];
  let depth = groupRow[DEPTH] as number;
  let absDepth = Math.abs(depth);
  let count = 0;
  let idx = grpIdx;

  // find the last nested group and work back - first build aggregates for level 1 groups,
  // then use those to aggregate to level 2 etc.
  while (
    idx < groupRows.length - 1 &&
    Math.abs(groupRows[idx + 1][DEPTH] as number) < absDepth
  ) {
    idx += 1;
    count += 1;
  }

  for (let i = grpIdx + count; i >= grpIdx; i--) {
    for (let aggIdx = 0; aggIdx < aggregations.length; aggIdx++) {
      const [colIdx] = aggregations[aggIdx];
      groupRows[i][colIdx] = 0;
    }
    aggregate(
      groupRows[i],
      groupRows,
      sortSet,
      rows,
      columns,
      aggregations,
      groupRows[i][COUNT] as number
    );
  }
}

function aggregate(
  groupRow: VuuDataRow,
  groupRows: VuuDataRow[],
  sortSet: number[],
  rows: VuuDataRow[],
  columns: TableColumn[],
  aggregations: [number, "avg" | "sum"][],
  leafCount: number
) {
  const { DEPTH, COUNT, FILTER_COUNT } = metaData(columns);
  const { IDX_POINTER } = metaData(columns);
  let absDepth = Math.abs(groupRow[DEPTH] as number);
  let count = 0;

  if (absDepth === 1) {
    // The first group accumulates aggregates from the raw data...
    let start = groupRow[IDX_POINTER] as number;
    let end = start + leafCount;
    count = leafCount;
    for (let i = start; i < end; i++) {
      const row = rows[sortSet[i]];
      for (let aggIdx = 0; aggIdx < aggregations.length; aggIdx++) {
        const [colIdx] = aggregations[aggIdx];
        const val = groupRow[colIdx] as number;
        groupRow[colIdx] = val + (row[colIdx] as number);
      }
    }
  } else {
    // higher-level groups aggregate from child-groups ...
    // we cannot blindly use the grpIndex of the groupRow, as we may be dealing with a smaller subset
    // of groupRows, e,g, when inserting a new row and creating the missing groups
    const startIdx = groupRows.indexOf(groupRow) + 1;
    for (let i = startIdx; i < groupRows.length; i++) {
      const nestedGroupRow = groupRows[i];
      const nestedRowDepth = nestedGroupRow[DEPTH] as number;
      const nestedRowCount = nestedGroupRow[COUNT] as number;
      const absNestedRowDepth = Math.abs(nestedRowDepth);
      if (absNestedRowDepth >= absDepth) {
        break;
      } else if (absNestedRowDepth === absDepth - 1) {
        for (let aggIdx = 0; aggIdx < aggregations.length; aggIdx++) {
          const [colIdx, method] = aggregations[aggIdx];
          const val = groupRow[colIdx] as number;
          const nestedVal = nestedGroupRow[colIdx] as number;
          if (method === "avg") {
            groupRow[colIdx] = val + nestedVal * nestedRowCount;
          } else {
            groupRow[colIdx] = val + nestedVal;
          }
        }
        count += nestedRowCount;
      }
    }
  }

  for (let aggIdx = 0; aggIdx < aggregations.length; aggIdx++) {
    const [colIdx, method] = aggregations[aggIdx];
    if (method === "avg") {
      const totalVal = groupRow[colIdx] as number;
      groupRow[colIdx] = totalVal / count;
    }
  }

  groupRow[COUNT] = count;
}
