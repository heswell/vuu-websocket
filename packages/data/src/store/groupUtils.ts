import {
  VuuDataRow,
  VuuGroupBy,
  VuuRowDataItemType,
} from "@vuu-ui/vuu-protocol-types";
import { ColumnMetaData, metaData } from "./columnUtils.ts";
import {
  ASC,
  GROUP_ROW_TEST,
  sortBy,
  SortCriteria,
  SortCriterium,
  sortPosition,
  SortSet,
} from "./sortUtils.ts";
import { ColumnMap, SortCriteriaItem } from "@vuu-ui/vuu-utils";
import { VuuDataRow } from "./rowset/rowSet.ts";
import { TableColumn } from "@heswell/server-types";

const LEAF_DEPTH = 0;
const DEFAULT_OPTIONS = {
  startIdx: 0,
  rootIdx: null,
  rootExpanded: true,
  baseGroupby: [],
};

export const mapGroupByToSortCriteria = (
  groupBy: VuuGroupBy,
  columnMap: ColumnMap
): SortCriteria => groupBy.map((column) => [columnMap[column], ASC]);

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

export type TrackedLevel = {
  key: string | null;
  pos: number | null;
  pPos: number | null;
  current: number;
  previous: number;
};
export class SimpleTracker {
  #levels: Record<number, TrackedLevel>;
  constructor(levels: number) {
    this.#levels = Array(levels)
      .fill(0)
      .reduce((acc, el, i) => {
        acc[i + 1] = { key: null, pos: null, pPos: null };
        return acc;
      }, {});
  }
  set(depth: number, pos: number, groupKey: string) {
    if (this.#levels) {
      const level = this.#levels[Math.abs(depth)];
      if (level && level.key !== groupKey) {
        if (level.key !== null) {
          level.pPos = level.pos;
        }
        level.key = groupKey;
        level.pos = pos;
      }
    }
  }

  hasParentPos(level: number) {
    return this.#levels[level + 1] && this.#levels[level + 1].pos !== null;
  }

  parentPos(level: number) {
    return this.#levels[level + 1].pos;
  }

  hasPreviousPos(level: number) {
    return this.#levels[level] && this.#levels[level].pPos !== null;
  }

  previousPos(level: number) {
    return this.#levels[level].pPos;
  }
}

export class GroupIdxTracker {
  #levels: Record<number, TrackedLevel>;
  #idxAdjustment: number;
  #maxLevel: number;

  constructor(levels: number) {
    this.#idxAdjustment = 0;
    this.#maxLevel = levels + 1;
    this.#levels =
      levels > 0
        ? Array(levels)
            .fill(0)
            .reduce((acc, el, i) => {
              acc[i + 2] = { key: null, current: 0, previous: 0 };
              return acc;
            }, {})
        : null;
  }

  increment(count: number) {
    this.#idxAdjustment += count;
    if (this.#levels) {
      for (let i = 2; i < this.#maxLevel + 1; i++) {
        this.#levels[i].current += count;
      }
    }
  }

  previous(level: number) {
    return (
      (this.#levels && this.#levels[level] && this.#levels[level].previous) || 0
    );
  }

  hasPrevious(level: number) {
    return this.previous(level) > 0;
  }

  get(idx: number) {
    return this.#levels === null ? null : this.#levels[idx];
  }

  set(depth: number, groupKey: string) {
    if (this.#levels) {
      const level = this.#levels[depth];
      if (level && level.key !== groupKey) {
        if (level.key !== null) {
          level.previous += level.current;
          level.current = 0;
        }
        level.key = groupKey;
      }
    }
  }
}

const itemIsNumeric = (item: unknown) => !isNaN(parseInt(item as string, 10));
const numerically = (a: string, b: string) => parseInt(a) - parseInt(b);

function sortKeys(groupedStruct: GroupedStruct) {
  const keys = Object.keys(groupedStruct);
  if (keys.every(itemIsNumeric)) {
    return keys.sort(numerically);
  } else {
    return keys.sort();
  }
}

export function fillNavSetsFromGroups(
  groupedStruct: GroupedStruct,
  sortSet: number[],
  sortIdx = 0,
  filterSet: number[] | undefined | null = null,
  filterIdx = -1,
  filterLen = -1
) {
  const keys = sortKeys(groupedStruct);
  const filtered = filterSet !== null;
  const filterIndices = filtered
    ? filterSet?.slice(filterIdx, filterLen)
    : null;
  for (const key of keys) {
    const groupedRows = groupedStruct[key];
    if (Array.isArray(groupedRows)) {
      // we have leaf level rows
      for (const rowIdx of groupedRows) {
        sortSet[sortIdx] = rowIdx;
        sortIdx += 1;
        // this could be prohibitively slow (the includes test) ...
        if (filtered && filterIndices?.includes(rowIdx)) {
          filterSet[filterIdx] = rowIdx;
          filterIdx += 1;
        }
      }
    } else {
      sortIdx = fillNavSetsFromGroups(groupedRows, sortSet, sortIdx);
    }
  }
  return sortIdx;
}

// WHY is param order different from groupLeafRows
export function groupRows(
  rows: VuuDataRow[],
  sortSet: number[],
  columns: TableColumn[],
  columnMap: ColumnMap,
  groupBy: VuuGroupBy,
  options: any = DEFAULT_OPTIONS
) {
  const {
    startIdx = 0,
    length = rows.length,
    rootIdx = null,
    baseGroupby = [],
    groups = [],
    rowParents = null,
    filterLength,
    filterSet,
    filterFn: filter,
  } = options;
  let { groupIdx = -1, filterIdx } = options;

  const groupCriteria = mapGroupByToSortCriteria(groupBy, columnMap);

  const aggregations = findAggregatedColumns(columns, columnMap, groupBy);
  const groupedLeafRows = groupLeafRows(
    sortSet,
    rows as (string | number)[][],
    groupCriteria,
    startIdx,
    length
  );
  fillNavSetsFromGroups(
    groupedLeafRows,
    sortSet,
    startIdx,
    filterSet,
    filterIdx,
    filterLength
  );

  const levels = groupBy.length;
  const currentGroups = Array(levels).fill(null);
  const { IDX, DEPTH, FILTER_COUNT, NEXT_FILTER_IDX } = metaData(columns);

  let parentIdx = rootIdx;
  let leafCount = 0;

  for (let i = startIdx, len = startIdx + length; i < len; i++) {
    const rowIdx = sortSet[i];
    const row = rows[rowIdx];

    for (let level = 0; level < levels; level++) {
      const [columnIdx] = groupCriteria[level];
      const currentGroup = currentGroups[level];
      const groupValue = row[columnIdx];
      // as soon as we identify a group change, each group at that level and below
      // is then aggregated and new group(s) initiated.
      if (currentGroup === null || currentGroup[columnIdx] !== groupValue) {
        if (currentGroup !== null) {
          // as soon as we know we're regrouping, aggregate the open groups, in reverse order
          for (let ii = levels - 1; ii >= level; ii--) {
            const group = currentGroups[ii];
            aggregate(
              group,
              groups,
              sortSet,
              rows,
              columns,
              aggregations,
              leafCount,
              filter
            );
            if (
              filterSet &&
              Math.abs(group[DEPTH]) === 1 &&
              group[FILTER_COUNT] > 0
            ) {
              group[NEXT_FILTER_IDX] = filterIdx;
              filterIdx += group[FILTER_COUNT];
            }
          }

          leafCount = 0;
        }
        for (let ii = level; ii < levels; ii++) {
          groupIdx += 1;
          parentIdx = ii === 0 ? rootIdx : currentGroups[ii - 1][IDX];
          const depth = levels - ii;
          // for first-level groups, row pointer is a pointer into the sortSet
          const childIdx = depth === 1 ? i : groupIdx + 1;

          const groupRow = (currentGroups[ii] = GroupRow(
            row,
            depth,
            groupIdx,
            childIdx,
            parentIdx,
            groupCriteria,
            columns,
            columnMap,
            baseGroupby
          ));
          groups.push(groupRow);
        }
        break; // do not continue looping once we identify the change point
      }
    }
    rowParents && (rowParents[rowIdx] = groupIdx);
    leafCount += 1;
  }

  for (let i = levels - 1; i >= 0; i--) {
    if (currentGroups[i] !== null) {
      const group = currentGroups[i];
      aggregate(
        group,
        groups,
        sortSet,
        rows,
        columns,
        aggregations,
        leafCount,
        filter
      );
      if (
        filterSet &&
        Math.abs(group[DEPTH]) === 1 &&
        group[FILTER_COUNT] > 0
      ) {
        group[NEXT_FILTER_IDX] = filterIdx;
      }
    }
  }
  return groups;
}

// Checks very specifically for new cols added at end
export function groupbyExtendsExistingGroupby(
  groupBy: VuuGroupBy,
  existingGroupBy: VuuGroupBy
) {
  return (
    groupBy.length > existingGroupBy.length &&
    existingGroupBy.every((g, i) => g[0] === groupBy[i][0])
  );
}

// doesn't care from which position col is removed, as long as it is not the first
export function groupbyReducesExistingGroupby(
  groupby: VuuGroupBy,
  existingGroupby: VuuGroupBy
) {
  return (
    existingGroupby.length > groupby.length &&
    groupby[0][0] === existingGroupby[0][0] &&
    groupby.every(([key]) => existingGroupby.find(([key2]) => key2 === key))
  );
}

export function groupbySortReversed(
  groupBy: VuuGroupBy,
  existingGroupBy: VuuGroupBy
) {
  const [col] = findSortedCol(groupBy, existingGroupBy);
  return col !== -1;
}

export function findDoomedColumnDepths(
  groupby: VuuGroupBy,
  existingGroupby: VuuGroupBy
) {
  const count = existingGroupby.length;
  return existingGroupby.reduce<number[]>((results, [colIdx], idx) => {
    if (!groupby.some((group) => group[0] === colIdx)) {
      results.push(count - idx);
    }
    return results;
  }, []);
}

export function findSortedCol(
  groupby: VuuGroupBy,
  existingGroupby: VuuGroupBy
) {
  let results: number[] = [-1];
  let len1 = groupby && groupby.length;
  let len2 = existingGroupby && existingGroupby.length;
  if (len1 && len2 && len1 === len2) {
    for (let i = 0; i < len1; i++) {
      if (groupby[i][0] !== existingGroupby[i][0]) {
        return results;
      } else if (groupby[i][1] !== existingGroupby[i][1]) {
        results[0] = i;
        results[1] = len1 - i;
      }
    }
  }
  return results;
}

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

// export function countNestedRows(rows, idx, depth) {
//     const DEPTH = Data.DEPTH_FIELD;
//     let count = 0;
//     for (let i = idx, len = rows.length;
//         i < len && Math.abs(rows[i][DEPTH]) < depth;
//         i++) {
//         count += 1;
//     }
//     return count;
// }

// TBC
// export function countGroupMembers(groupedRows) {
//     const results = [];
//     const groups = [];
//     let currentGroup = null;

//     for (let i = 0; i < groupedRows.length; i++) {
//         let [, depth] = groupedRows[i];
//         if (depth === LEAF_DEPTH) {
//             currentGroup.count += 1;
//         } else {
//             depth = Math.abs(depth);
//             while (currentGroup && depth >= currentGroup.depth) {
//                 const completedGroup = groups.shift();
//                 const group = results[completedGroup.i];
//                 if (group[Data.COUNT_FIELD] !== completedGroup.count) {
//                     const newGroup = group.slice();
//                     newGroup[Data.COUNT_FIELD] = completedGroup.count;
//                     results[completedGroup.i] = newGroup;
//                 }
//                 groups.forEach(higherLevelGroup => higherLevelGroup.count += completedGroup.count);
//                 ([currentGroup] = groups);
//             }

//             currentGroup = { i, depth, count: 0 };
//             groups.unshift(currentGroup);
//         }

//         results[i] = groupedRows[i];

//     }

//     while (currentGroup) {
//         const completedGroup = groups.shift();
//         const group = results[completedGroup.i];
//         if (group[Data.COUNT_FIELD] !== completedGroup.count) {
//             const newGroup = group.slice();
//             newGroup[Data.COUNT_FIELD] = completedGroup.count;
//             results[completedGroup.i] = newGroup;
//         }
//         groups.forEach(higherLevelGroup => higherLevelGroup.count += completedGroup.count);
//         ([currentGroup] = groups);
//     }

//     return results;
// }

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

export function adjustLeafIdxPointers(
  groups: VuuDataRow[],
  insertionPoint: number,
  { DEPTH, IDX_POINTER }: ColumnMetaData,
  adjustment = 1
) {
  for (let i = 0; i < groups.length; i++) {
    if (
      Math.abs(groups[i][DEPTH] as number) === 1 &&
      (groups[i][IDX_POINTER] as number) >= insertionPoint
    ) {
      const idxPointer = groups[i][IDX_POINTER] as number;
      groups[i][IDX_POINTER] = idxPointer + adjustment;
    }
  }
}

export function findGroupPositions(
  groupRows: VuuDataRow[],
  groupby: SortCriteria,
  row: VuuDataRow
) {
  const positions = [];

  out: for (let i = 0; i < groupby.length; i++) {
    const sorter = sortBy(groupby.slice(0, i + 1), GROUP_ROW_TEST);
    const position = sortPosition(groupRows, sorter, row, "first-available");
    const group = groupRows[position];
    // if all groups are missing and insert position is end of list ...
    if (group === undefined) {
      break;
    }
    // position is confirmed if all groupCol values in this comparison match values of row
    // and other groupCol values  are null
    for (let j = 0; j < groupby.length; j++) {
      const colIdx = groupby[j][0];
      const colValue = group[colIdx];
      if (j > i) {
        if (colValue !== null) {
          break out;
        }
      } else if (colValue !== row[colIdx]) {
        break out;
      }
    }
    positions.push(position);
  }

  return positions;
}

export const expandRow = (
  groupCriteria: SortCriteria,
  row: VuuDataRow,
  meta: ColumnMetaData
) => {
  const r = row.slice();
  r[meta.IDX] = 0;
  r[meta.DEPTH] = 0;
  r[meta.COUNT] = 0;
  r[meta.KEY] = buildGroupKey(groupCriteria, row);
  r[meta.SELECTED] = 0;
  return r;
};

function buildGroupKey(groupCriteria: SortCriteria, row: VuuDataRow) {
  const extractKey = ([idx]: SortCriterium) => row[idx] as number;
  return groupCriteria.map(extractKey).join("/");
}

// Do we have to take columnMap out again ?
function GroupRow(
  row: VuuDataRow,
  depth: number,
  idx: number,
  childIdx: number,
  parentIdx: number,
  groupby: SortCriteria,
  columns: TableColumn[],
  columnMap: ColumnMap,
  baseGroupby: SortCriteria = []
) {
  const {
    IDX,
    RENDER_IDX,
    DEPTH,
    COUNT,
    KEY,
    SELECTED,
    PARENT_IDX,
    IDX_POINTER,
    count,
  } = metaData(columns);
  const group = Array(count);
  const groupIdx = groupby.length - depth;
  let colIdx: number;

  for (let i = 0; i < columns.length; i++) {
    const column = columns[i];
    const key = columnMap[column.name];
    if (column.aggregate) {
      // implies we can't group on aggregate columns, does the UI know that ?
      group[key] = 0;
    } else if (
      (colIdx = indexOfCol(key, groupby)) !== -1 &&
      colIdx <= groupIdx
    ) {
      group[key] = row[key];
    } else {
      group[key] = null;
    }
  }

  for (let i = 0; i < baseGroupby.length; i++) {
    const [colIdx] = baseGroupby[i];
    group[colIdx] = row[colIdx];
  }

  const extractKey = ([idx]: SortCriterium) => row[idx];
  const buildKey = (groupBy: SortCriteria) => groupby.map(extractKey).join("/");
  //TODO build the composite key for the grouprow
  const baseKey = baseGroupby.length > 0 ? buildKey(baseGroupby) + "/" : "";
  const groupKey = buildKey(groupby.slice(0, groupIdx + 1));

  group[IDX] = idx;
  group[RENDER_IDX] = 0;
  group[DEPTH] = -depth;
  group[COUNT] = 0;
  group[KEY] = "$root/" + baseKey + groupKey;
  group[SELECTED] = 0;
  group[IDX_POINTER] = childIdx;
  group[PARENT_IDX] = parentIdx;

  return group;
}

type TreeNode<T> = {
  value: T;
  left?: TreeNode<T>;
  right?: TreeNode<T>;
};

export type LeafEntry = number[];
export type GroupEntry = GroupedStruct | LeafEntry;
export type GroupedStruct = {
  [key: string | number]: GroupEntry;
};

const isLeafLevelEntry = (
  groupEntry: GroupEntry,
  level: number,
  leafLevel: number
): groupEntry is LeafEntry => Array.isArray(groupEntry) && level === leafLevel;

export function groupLeafRows(
  sortSet: number[],
  leafRows: Array<(number | string)[]>,
  groupby: SortCriteria,
  startIdx = 0,
  length = sortSet.length
) {
  const groupedSet: GroupedStruct = {};
  const levels = groupby.length;
  const leafLevel = levels - 1;
  // for each row ...
  for (let i = startIdx, len = startIdx + length; i < len; i++) {
    const idx = sortSet[i];
    const leafRow = leafRows[idx];
    let target = groupedSet;
    let groupEntry: GroupEntry;
    // ... and each level of grouping ...
    for (let level = 0; level < levels; level++) {
      const groupValue = leafRow[groupby[level][0]];
      groupEntry = target[groupValue];
      if (isLeafLevelEntry(groupEntry, level, leafLevel)) {
        groupEntry.push(idx);
      } else if (groupEntry) {
        target = groupEntry;
      } else if (!groupEntry && level < leafLevel) {
        target = target[groupValue] = {};
      } else if (!groupEntry) {
        target[groupValue] = [idx];
      }
    }
  }
  return groupedSet;
}

export function splitGroupsAroundDoomedGroup(
  groupCriteria: SortCriteria,
  doomed: number
) {
  const lastGroupIsDoomed = doomed === 1;
  const doomedIdx = groupCriteria.length - doomed;
  const preDoomedGroupby: SortCriteria = [];
  const postDoomedGroupby: SortCriteria = [];

  groupCriteria.forEach((col, i) => {
    if (i < doomedIdx) {
      preDoomedGroupby.push(col);
    } else if (i > doomedIdx) {
      postDoomedGroupby.push(col);
    }
  });

  return [lastGroupIsDoomed, preDoomedGroupby, postDoomedGroupby];
}

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
  leafCount: number,
  filter: ((r: VuuDataRow) => boolean) | null = null
) {
  const { DEPTH, COUNT, FILTER_COUNT } = metaData(columns);
  const { IDX_POINTER } = metaData(columns);
  let absDepth = Math.abs(groupRow[DEPTH] as number);
  let count = 0;
  let filteredCount = filter === null ? -1 : 0;

  if (absDepth === 1) {
    // The first group accumulates aggregates from the raw data...
    let start = groupRow[IDX_POINTER] as number;
    let end = start + leafCount;
    count = leafCount;
    for (let i = start; i < end; i++) {
      const row = rows[sortSet[i]];
      const included = filter === null || filter(row);
      if (filter && included) {
        filteredCount += 1;
      }
      if (filter === null || included) {
        for (let aggIdx = 0; aggIdx < aggregations.length; aggIdx++) {
          const [colIdx] = aggregations[aggIdx];
          const val = groupRow[colIdx] as number;
          groupRow[colIdx] = val + (row[colIdx] as number);
        }
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
  groupRow[FILTER_COUNT] = filteredCount;
}
