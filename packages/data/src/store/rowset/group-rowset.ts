import { ASC, mapSortDefsToSortCriteria, SortCriteria } from "../sortUtils.js";
import { extendsExistingFilter } from "../filter.js";
import { GroupIterator, IIterator } from "../groupIterator.js";
import {
  adjustGroupIndices,
  adjustLeafIdxPointers,
  aggregateGroup,
  allGroupsExpanded,
  decrementDepth,
  expandRow,
  findAggregatedColumns,
  findDoomedColumnDepths,
  findGroupPositions,
  findSortedCol,
  getCount,
  getGroupStateChanges,
  groupbyExtendsExistingGroupby,
  groupbyReducesExistingGroupby,
  groupbySortReversed,
  GroupIdxTracker,
  groupRows,
  incrementDepth,
  lowestIdxPointer,
  mapGroupByToSortCriteria,
  SimpleTracker,
  splitGroupsAroundDoomedGroup,
} from "../groupUtils.js";
import { NULL_RANGE } from "../rangeUtils.js";
import { sortBy, sortPosition } from "../sortUtils.js";
import { BaseRowSet, VuuDataRow, RowSet } from "./rowSet.js";
import { TableColumn } from "@heswell/server-types";
import {
  VuuAggregation,
  VuuGroupBy,
  VuuRange,
  VuuSortCol,
} from "@vuu-ui/vuu-protocol-types";
import { DataResponse } from "./IRowSet.js";
import { Filter } from "@vuu-ui/vuu-filter-types";
import { filterPredicate } from "@vuu-ui/vuu-filter-parser";

const EMPTY_AGGREGATIONS: VuuAggregation[] = [];

type ChildGroupProcessor = (
  childDepth: number,
  startIdx: number,
  groupRows: VuuDataRow[],
  useFilter: boolean
) => number;

export class GroupRowSet extends BaseRowSet {
  #aggregatedColumn: any = {};
  #groupBy: VuuGroupBy;
  #aggregations: VuuAggregation[];
  #currentLength = 0;
  #groupRows: VuuDataRow[];
  #iter: IIterator;
  // TODO do we really need this, what about SortSet
  #groupSortSet: number[];
  #groupState: any;
  #rowParents: number[];

  constructor(
    rowSet: RowSet,
    columns: TableColumn[],
    groupBy: VuuGroupBy,
    filter = rowSet.currentFilter
  ) {
    super(rowSet.table, columns);
    this.#groupBy = groupBy;
    this.#aggregations = [];
    this.#groupRows = [];

    this.range = rowSet.range;

    this.collapseChildGroups = this.collapseChildGroups.bind(this);
    this.countChildGroups = this.countChildGroups.bind(this);

    const { columnMap } = rowSet.table;

    columns.forEach((column) => {
      if (column.aggregate) {
        const key = columnMap[column.name];
        this.#aggregations.push([key, column.aggregate]);
        this.#aggregatedColumn[key] = column.aggregate;
      }
    });

    // can we lazily build the sortSet as we fetch data for the first time ?
    this.#groupSortSet = rowSet.data.map((d, i) => i);
    // we will store an array of pointers to parent Groups.mirroring sequence of leaf rows
    this.#rowParents = Array(rowSet.data.length);

    this.applyGroupby(groupBy);

    const [navSet, IDX, COUNT] = this.selectNavigationSet(false);
    // // TODO roll the IDX and COUNT overrides into meta
    this.#iter = new GroupIterator({
      groupRows: this.#groupRows,
      navSet,
      data: this.table.rows,
      NAV_IDX: IDX,
      NAV_COUNT: COUNT,
      meta: this.meta,
      range: this.range,
    });

    // if (filter) {
    //   this.filter(filter);
    // }
  }

  selectNavigationSet(useFilter: boolean): [number[], number, number] {
    const { COUNT, IDX_POINTER, FILTER_COUNT, NEXT_FILTER_IDX } = this.meta;
    return useFilter && this.filterSet
      ? [this.filterSet, NEXT_FILTER_IDX, FILTER_COUNT]
      : [this.#groupSortSet, IDX_POINTER, COUNT];
  }

  get length() {
    return this.#currentLength;
  }
  get first() {
    return this.table.rows.at(0);
  }
  get last() {
    return this.table.rows.at(-1);
  }

  currentRange() {
    return this.setRange(this.range, false);
  }

  setRange(range: VuuRange, useDelta = true): DataResponse {
    const [rowsInRange, idx] =
      !useDelta && range.from === this.range.from && range.to === this.range.to
        ? this.#iter.currentRange()
        : this.#iter.setRange(range, useDelta);

    const filterCount = (this.filterSet && this.meta.FILTER_COUNT) ?? -1;
    const rows = rowsInRange.map((row, i) =>
      this.cloneRow(row, idx + i, filterCount)
    );
    this.range = range;
    return {
      rows,
      size: this.length,
    };
  }

  cloneRow(row: VuuDataRow, idx: number, FILTER_COUNT: number) {
    const { IDX, DEPTH, COUNT } = this.meta;
    const dolly = row.slice();
    dolly[IDX] = idx;

    if (
      FILTER_COUNT &&
      dolly[DEPTH] !== 0 &&
      typeof dolly[FILTER_COUNT] === "number"
    ) {
      dolly[COUNT] = dolly[FILTER_COUNT];
    }
    return dolly;
  }

  applyGroupby(groupBy: VuuGroupBy, rows = this.data) {
    const {
      columns,
      table: { columnMap },
    } = this;

    this.#groupRows.length = 0;
    this.#groupRows = groupRows(
      rows,
      this.#groupSortSet,
      columns,
      columnMap,
      groupBy,
      {
        groups: this.#groupRows,
        rowParents: this.#rowParents,
      }
    );
    this.#currentLength = this.countVisibleRows(this.#groupRows);

    console.table(this.#groupRows);
  }

  groupBy(groupby: VuuGroupBy) {
    if (groupbySortReversed(groupby, this.#groupBy)) {
      this.sortGroupby(groupby);
    } else if (groupbyExtendsExistingGroupby(groupby, this.#groupBy)) {
      this.extendGroupby(groupby);
      this.#currentLength = this.countVisibleRows(
        this.#groupRows,
        this.filterSet !== null
      );
    } else if (groupbyReducesExistingGroupby(groupby, this.#groupBy)) {
      this.reduceGroupby(groupby);
      this.range = NULL_RANGE;
      this.#iter.clear();
      this.#currentLength = this.countVisibleRows(
        this.#groupRows,
        this.filterSet !== null
      );
    } else {
      this.applyGroupby(groupby);
    }
    this.#groupBy = groupby;
  }

  // User interaction will never produce more than one change, but programatic change might !
  //TODO if we have sortCriteria, apply to leaf rows as we expand
  setGroupState(groupState: any) {
    // onsole.log(`[groupRowSet.setGroupState] ${JSON.stringify(groupState,null,2)}`)
    const changes = getGroupStateChanges(groupState, this.#groupState);
    changes.forEach(([key, , isExpanded]) => {
      const groupIdx = this.findGroupIdx(key);
      if (groupIdx !== -1) {
        if (isExpanded) {
          this.#currentLength += this.expandGroup(groupIdx, this.#groupRows);
        } else {
          this.#currentLength -= this.collapseGroup(groupIdx, this.#groupRows);
        }
      } else {
        console.warn(`setGroupState could not find row to toggle`);
      }
    });
    this.#groupState = groupState;
  }

  expandGroup(idx: number, groups: VuuDataRow[]) {
    return this.toggleGroup(idx, groups, this.countChildGroups);
  }

  collapseGroup(idx: number, groups: VuuDataRow[]) {
    return this.toggleGroup(idx, groups, this.collapseChildGroups);
  }

  toggleGroup(
    groupIdx: number,
    groupRows: VuuDataRow[],
    processChildGroups: ChildGroupProcessor
  ) {
    const { DEPTH, COUNT, FILTER_COUNT } = this.meta;
    let adjustment = 0;
    const groupRow = groupRows[groupIdx];
    const depth = groupRow[DEPTH] as number;
    const useFilter = this.filterSet !== null;
    groupRow[DEPTH] = -depth;
    if (Math.abs(depth) === 1) {
      const COUNT_IDX = useFilter ? FILTER_COUNT : COUNT;
      adjustment = groupRow[COUNT_IDX] as number;
    } else {
      adjustment = processChildGroups(
        Math.abs(depth) - 1,
        groupIdx + 1,
        groupRows,
        useFilter
      );
    }
    return adjustment;
  }

  countChildGroups: ChildGroupProcessor = (
    childDepth,
    startIdx,
    groupRows,
    useFilter
  ) => {
    const { DEPTH, FILTER_COUNT } = this.meta;
    let adjustment = 0;
    for (let i = startIdx; i < groupRows.length; i++) {
      const nextDepth = groupRows[i][DEPTH] as number;
      if (Math.abs(nextDepth) === childDepth) {
        if (!useFilter || (groupRows[i][FILTER_COUNT] as number) > 0) {
          adjustment += 1;
        }
      } else if (Math.abs(nextDepth) > childDepth) {
        break;
      }
    }
    return adjustment;
  };

  collapseChildGroups: ChildGroupProcessor = (
    childDepth,
    startIdx,
    groupRows,
    useFilter
  ) => {
    const { DEPTH, FILTER_COUNT } = this.meta;
    let adjustment = 0;
    for (let i = startIdx; i < groupRows.length; i++) {
      const nextDepth = groupRows[i][DEPTH] as number;
      if (Math.abs(nextDepth) === childDepth) {
        if (!useFilter || (groupRows[i][FILTER_COUNT] as number) > 0) {
          adjustment += 1;
          if (nextDepth > 0) {
            adjustment += this.collapseGroup(i, groupRows);
          }
        }
      } else if (Math.abs(nextDepth) > childDepth) {
        break;
      }
    }
    return adjustment;
  };

  sort(sortDefs: VuuSortCol[]) {
    const { IDX, DEPTH, COUNT, IDX_POINTER } = this.meta;
    const { columnMap } = this.table;
    const sortCriteria = mapSortDefsToSortCriteria(sortDefs, columnMap);
    //TODO only need to handle visible rows
    for (let i = 0; i < this.#groupRows.length; i++) {
      const groupRow = this.#groupRows[i];
      const depth = groupRow[DEPTH] as number;
      const count = groupRow[COUNT] as number;
      const absDepth = Math.abs(depth);
      const sortIdx = groupRow[IDX_POINTER] as number;
      if (absDepth === 1) {
        this.sortDataSubset(sortIdx, count, sortCriteria, IDX);
      }
    }
  }

  sortDataSubset(
    startIdx: number,
    length: number,
    sortCriteria: SortCriteria,
    IDX: number
  ) {
    const rows = [];
    for (let i = startIdx; i < startIdx + length; i++) {
      const rowIdx = this.sortSet[i];
      rows.push(this.data[rowIdx]);
    }
    rows.sort(sortBy(sortCriteria));
    for (let i = 0; i < rows.length; i++) {
      this.sortSet[i + startIdx] = rows[i][IDX];
    }
  }

  clearFilter(/*cloneChanges*/) {
    this.currentFilter = undefined;
    this.filterSet = undefined;
    // rebuild agregations for groups where filter count is less than count, remove filter count
    const { data: rows, sortSet, columns, table } = this;
    const { COUNT, FILTER_COUNT, NEXT_FILTER_IDX } = this.meta;
    const aggregations = findAggregatedColumns(
      columns,
      table.columnMap,
      this.#groupBy
    );

    for (let i = 0; i < this.#groupRows.length; i++) {
      let groupRow = this.#groupRows[i];
      const count = groupRow[COUNT] as number;
      if (
        typeof groupRow[FILTER_COUNT] === "number" &&
        count > groupRow[FILTER_COUNT]
      ) {
        aggregateGroup(
          this.#groupRows,
          i,
          sortSet,
          rows,
          columns,
          aggregations
        );
        groupRow[FILTER_COUNT] = -1;
        groupRow[NEXT_FILTER_IDX] = -1;
      }
    }

    this.#iter.setNavSet(this.selectNavigationSet(false));
    this.#currentLength = this.countVisibleRows(this.#groupRows, false);
  }

  filter(filter: Filter) {
    const extendsCurrentFilter = extendsExistingFilter(
      filter,
      this.currentFilter
    );
    const { table } = this;
    const fn = filter && filterPredicate(this.table.columnMap, filter);
    const { COUNT, DEPTH, PARENT_IDX, FILTER_COUNT, NEXT_FILTER_IDX } =
      this.meta;
    const { data: rows } = this;
    let [navSet, NAV_IDX, NAV_COUNT] = this.selectNavigationSet(
      extendsCurrentFilter && this.filterSet !== undefined
    );
    const newFilterSet = [];

    for (let i = 0; i < this.#groupRows.length; i++) {
      let groupRow = this.#groupRows[i];
      const depth = groupRow[DEPTH] as number;
      const count = getCount(groupRow, NAV_COUNT, COUNT);
      const absDepth = Math.abs(depth);

      if (absDepth === 1) {
        const sortIdx = groupRow[NAV_IDX] as number;
        let rowCount = 0;

        for (let ii = sortIdx; ii < sortIdx + count; ii++) {
          const rowIdx = navSet[ii];
          const row = rows[rowIdx];
          const includerow = fn(row);
          if (includerow) {
            rowCount += 1;
            if (rowCount === 1) {
              groupRow[NEXT_FILTER_IDX] = newFilterSet.length;
            }
            newFilterSet.push(rowIdx);
          }
        }

        groupRow[FILTER_COUNT] = rowCount;
        let aggregations = EMPTY_AGGREGATIONS;
        // we cannot be sure what filter changes have taken effect, so we must recalculate aggregations
        if (this.#aggregations.length) {
          aggregations = this.#aggregations.map(([i, a]) => [i, a, 0]);
          const len = newFilterSet.length;
          for (let ii = len - rowCount; ii < len; ii++) {
            const rowIdx = newFilterSet[ii];
            const row = rows[rowIdx];
            for (let j = 0; j < aggregations.length; j++) {
              let [colIdx] = aggregations[j];
              aggregations[j][2] += row[colIdx];
            }
          }

          // 2) store aggregates at lowest level of the group hierarchy
          aggregations.forEach((aggregation) => {
            const [colIdx, type, sum] = aggregation;
            if (type === "sum") {
              groupRow[colIdx] = sum;
            } else if (type === "avg") {
              groupRow[colIdx] = sum / rowCount;
            }
          });
        }

        // update parent counts
        if (rowCount > 0) {
          while (groupRow[PARENT_IDX] !== null) {
            groupRow = this.#groupRows[groupRow[PARENT_IDX] as number];

            aggregations.forEach((aggregation) => {
              const [colIdx, type, sum] = aggregation;
              if (type === "sum") {
                groupRow[colIdx] += sum;
              } else if (type === "avg") {
                const originalCount = groupRow[FILTER_COUNT];
                const originalSum = originalCount * groupRow[colIdx];
                groupRow[colIdx] =
                  (originalSum + sum) / (originalCount + rowCount);
              }
            });
            groupRow[FILTER_COUNT] += rowCount;
          }
        }
      } else {
        // Higher-level group aggregations are calculated from lower level groups
        // initialize aggregated columns
        groupRow[FILTER_COUNT] = 0;
        this.#aggregations.forEach((aggregation) => {
          const [colIdx] = aggregation;
          groupRow[colIdx] = 0;
        });
      }
    }
    this.filterSet = newFilterSet;
    this.currentFilter = filter;
    this.#currentLength = this.countVisibleRows(this.#groupRows, true);

    this.#iter.setNavSet(this.selectNavigationSet(true));
  }

  update(rowIdx: number, updates) {
    const {
      range: { from },
    } = this;
    const { COUNT, FILTER_COUNT, PARENT_IDX } = this.meta;

    let groupUpdates;
    const rowUpdates = [];

    for (let i = 0; i < updates.length; i += 3) {
      // the col mappings in updates refer to base column definitions
      const colIdx = updates[i];
      const originalValue = updates[i + 1];
      const value = updates[i + 2];
      rowUpdates.push(colIdx, originalValue, value);

      let grpIdx = this.#rowParents[rowIdx];
      // this seems to return 0 an awful lot
      let ii = 0;

      // If this column is being aggregated
      if (this.#aggregatedColumn[colIdx]) {
        groupUpdates = groupUpdates || [];
        // collect adjusted aggregations for each group level
        do {
          let groupRow = this.#groupRows[grpIdx];

          let originalGroupValue = groupRow[colIdx];
          const diff = value - originalValue;
          const type = this.#aggregatedColumn[colIdx];
          const val = groupRow[colIdx] as number;
          if (type === "sum") {
            groupRow[colIdx] = val + diff;
          } else if (type === "avg") {
            const count = getCount(groupRow, FILTER_COUNT, COUNT);
            groupRow[colIdx] = (val * count + diff) / count;
          }

          (groupUpdates[ii] || (groupUpdates[ii] = [grpIdx])).push(
            colIdx,
            originalGroupValue,
            groupRow[colIdx]
          );

          grpIdx = groupRow[PARENT_IDX] as number;
          ii += 1;
        } while (grpIdx !== null);
      }
    }

    const outgoingUpdates = [];
    // check rangeIdx for both row and group updates, if they are not in range, they have not been
    // sent to client and do not need to be added to outgoing updates
    if (groupUpdates) {
      // the groups are currently in reverse order, lets send them out outermost group first
      for (let i = groupUpdates.length - 1; i >= 0; i--) {
        const [grpIdx, ...updates] = groupUpdates[i];
        // won't work - need to chnage groupIterator
        const rangeIdx = this.#iter.getRangeIndexOfGroup(grpIdx);
        if (rangeIdx !== -1) {
          outgoingUpdates.push([from + rangeIdx, ...updates]);
        }
      }
    }
    const rangeIdx = this.#iter.getRangeIndexOfRow(rowIdx);
    if (rangeIdx !== -1) {
      // onsole.log(`[GroupRowSet.update] updates for row idx ${idx} ${rangeIdx+offset} ${JSON.stringify(rowUpdates)}`)
      outgoingUpdates.push([from + rangeIdx, ...rowUpdates]);
    }

    return outgoingUpdates;
  }

  insert(newRowIdx: number, row: VuuDataRow) {
    // TODO look at append and idx manipulation for insertion at head.
    const { data: rows, sortSet, columns, meta, table } = this;
    const { columnMap } = table;
    let groupCriteria = mapGroupByToSortCriteria(this.#groupBy, columnMap);
    const groupPositions = findGroupPositions(
      this.#groupRows,
      groupCriteria,
      row
    );
    const { IDX, COUNT, KEY, IDX_POINTER } = meta;
    const GROUP_KEY_SORT = [[KEY, "asc"]];
    const allGroupsExist = groupPositions.length === this.#groupBy.length;
    const noGroupsExist = groupPositions.length === 0;
    const someGroupsExist = !noGroupsExist && !allGroupsExist;
    let result;
    let newGroupIdx = null;

    if (allGroupsExist) {
      // all necessary groups are already in place, we will just insert a row and update counts/aggregates
      let grpIdx = groupPositions[groupPositions.length - 1];
      const groupRow = this.#groupRows[grpIdx];
      this.#rowParents[newRowIdx] = grpIdx;
      let count = groupRow[COUNT] as number;
      const idxPointer = groupRow[IDX_POINTER] as number;
      const insertionPoint = idxPointer + count;
      // all existing pointers from the insertionPoint forward are going to be displaced by +1
      adjustLeafIdxPointers(this.#groupRows, insertionPoint, meta);
      sortSet.splice(insertionPoint, 0, row[IDX]);
      if (allGroupsExpanded(this.#groupRows, groupRow, meta)) {
        this.#currentLength += 1;
      }
    } else {
      newGroupIdx = sortPosition(
        this.#groupRows,
        sortBy(GROUP_KEY_SORT),
        expandRow(groupCriteria, row, meta),
        "last-available"
      );
      sortSet.push(newRowIdx);
      let nestedGroups, baseGroupby, rootIdx;

      if (someGroupsExist) {
        baseGroupby = groupCriteria.slice(0, groupPositions.length);
        rootIdx =
          this.#groupRows[groupPositions[groupPositions.length - 1]][IDX];
        groupCriteria = groupCriteria.slice(groupPositions.length);
      }

      nestedGroups = groupRows(
        rows,
        sortSet,
        columns,
        columnMap,
        groupCriteria,
        {
          startIdx: sortSet.length - 1,
          length: 1,
          groupIdx: newGroupIdx - 1,
          baseGroupby,
          rootIdx,
        }
      );

      adjustGroupIndices(
        this.#groupRows,
        newGroupIdx,
        meta,
        nestedGroups.length
      );
      this.#groupRows.splice.apply(
        this.#groupRows,
        [newGroupIdx, 0].concat(nestedGroups)
      );
    }

    this.incrementGroupCounts(groupPositions);
    this.updateAggregatedValues(groupPositions, row);

    this.#iter.refresh(); // force iterator to rebuild rangePositions
    let rangeIdx = allGroupsExist
      ? this.#iter.getRangeIndexOfRow(newRowIdx)
      : this.#iter.getRangeIndexOfGroup(newGroupIdx);

    if (rangeIdx !== -1) {
      // New row is visible within viewport so we will force render all rows
      result = { replace: true };
      if (newGroupIdx !== null) {
        this.#currentLength += 1;
      }
    } else if (noGroupsExist === false) {
      // new row is not visible as group is collapsed, but we need to update groiup row(s)
      result = { updates: this.collectGroupUpdates(groupPositions) };
    }

    return result;
  }

  incrementGroupCounts(groupPositions: number[]) {
    const { COUNT } = this.meta;

    groupPositions.forEach((grpIdx) => {
      const group = this.#groupRows[grpIdx];
      const count = group[COUNT] as number;
      group[COUNT] = count + 1;
    });
  }

  updateAggregatedValues(groupPositions: number[], row: VuuDataRow) {
    groupPositions.forEach((grpIdx) => {
      const group = this.#groupRows[grpIdx];
      for (let [key, type] of this.#aggregations) {
        const value = row[key] as number;
        const groupValue = group[key] as number;
        if (type === "sum") {
          group[key] = groupValue + value;
        }
      }
    });
  }

  collectGroupUpdates(groupPositions: number[]) {
    const {
      meta: { COUNT },
    } = this;
    const updates = [];
    for (let grpIdx of groupPositions) {
      const rangeIdx = this.#iter.getRangeIndexOfGroup(grpIdx);
      if (rangeIdx !== -1) {
        const group = this.#groupRows[grpIdx];
        const update = [rangeIdx, COUNT, group[COUNT]];
        for (let [key] of this.#aggregations) {
          update.push(key, group[key]);
        }
        updates.push(update);
      }
    }
    return updates;
  }

  // start with a simplesequential search
  findGroupIdx(groupKey: string) {
    const { KEY } = this.meta;
    for (let i = 0; i < this.#groupRows.length; i++) {
      if (this.#groupRows[i][KEY] === groupKey) {
        return i;
      }
    }
    return -1;
  }

  sortGroupby(groupBy: VuuGroupBy) {
    const { IDX, KEY, DEPTH, IDX_POINTER, PARENT_IDX } = this.meta;
    const { columnMap } = this.table;
    const groupCols = mapGroupByToSortCriteria(groupBy, columnMap);
    const [colIdx, depth] = findSortedCol(groupBy, this.#groupBy);
    let count = 0;
    let i = 0;
    for (; i < this.#groupRows.length; i++) {
      if (Math.abs(this.#groupRows[i][DEPTH] as number) > depth) {
        if (count > 0) {
          this.sortGroupRowsSubset(groupCols, colIdx, i - count, count);
          count = 0;
        }
      } else {
        count += 1;
      }
    }

    this.sortGroupRowsSubset(groupCols, colIdx, i - count, count);

    const tracker = new SimpleTracker(groupBy.length);
    this.#groupRows.forEach((groupRow, i) => {
      const depth = groupRow[DEPTH] as number;
      const groupKey = groupRow[KEY];
      const absDepth = Math.abs(depth);
      tracker.set(absDepth, i, groupKey);
      groupRow[IDX] = i;
      if (absDepth > 1) {
        groupRow[IDX_POINTER] = i + 1;
      }
      if (tracker.hasParentPos(absDepth)) {
        groupRow[PARENT_IDX] = tracker.parentPos(absDepth);
      }
    });
  }

  sortGroupRowsSubset(
    groupCriteria: SortCriteria,
    colIdx: number,
    startPos = 0,
    length = this.#groupRows.length
  ) {
    let insertPos = startPos + length;
    const [groupColIdx, direction] = groupCriteria[colIdx];
    const before = (k1, k2) => (direction === ASC ? k2 > k1 : k1 > k2);
    const after = (k1, k2) => (direction === ASC ? k2 < k1 : k1 < k2);
    let currentKey = null;
    for (let i = startPos; i < startPos + length; i++) {
      const key = this.#groupRows[i][groupColIdx];
      if (currentKey === null) {
        currentKey = key;
      } else if (before(key, currentKey)) {
        const splicedRows = this.#groupRows.splice(startPos, i - startPos);
        insertPos -= splicedRows.length;
        this.#groupRows.splice.apply(
          this.#groupRows,
          [insertPos, 0].concat(splicedRows)
        );
        currentKey = key;
        i = startPos - 1;
      } else if (after(key, currentKey)) {
        break;
      }
    }
  }

  // there is a current assumption here that new col(s) are always added at the end of existing cols in the groupBy
  // Need to think about a new col inserted at start or in between existing cols
  //TODO we might want to do this on expanded nodes only and repat in a lazy fashion as more nodes are revealed
  extendGroupby(groupBy: VuuGroupBy) {
    const { columnMap } = this._table;
    const groupCols = mapGroupByToSortCriteria(groupBy, columnMap);
    const baseGroupCols = groupCols.slice(0, this.#groupBy.length);
    const newGroupbyClause = groupCols.slice(this.#groupBy.length);
    const {
      groupby: baseGroupby,
      data: rows,
      columns,
      sortSet,
      filterSet,
      meta,
    } = this;
    const { IDX_POINTER, PARENT_IDX, NEXT_FILTER_IDX } = meta;
    const baseLevels = baseGroupby.length;
    const tracker = new GroupIdxTracker(baseLevels - 1);
    const filterFn = this.currentFilter
      ? filterPredicate(columnMap, this.currentFilter)
      : null;

    // we are going to insert new rows into groupRows and update the PARENT_IDX pointers in data rows
    for (let i = 0; i < this.#groupRows.length; i++) {
      const groupRow = this.#groupRows[i];
      if (tracker.idxAdjustment) {
        groupRow[meta.IDX] += tracker.idxAdjustment;
      }

      const rootIdx = groupRow[meta.IDX];
      const depth = groupRow[meta.DEPTH] as number;
      const length = groupRow[meta.COUNT];
      const groupKey = groupRow[meta.KEY];

      const absDepth = Math.abs(depth);
      groupRow[meta.DEPTH] = incrementDepth(depth);
      const filterLength = groupRow[meta.FILTER_COUNT];
      const filterIdx = groupRow[NEXT_FILTER_IDX];
      groupRow[meta.NEXT_FILTER_IDX] = undefined;

      if (tracker.hasPrevious(absDepth + 1)) {
        groupRow[PARENT_IDX] += tracker.previous(absDepth + 1);
      }

      if (absDepth === 1) {
        const startIdx = groupRow[IDX_POINTER];
        const nestedGroupRows = groupRows(
          rows,
          sortSet,
          columns,
          columnMap,
          newGroupbyClause,
          {
            startIdx,
            length,
            rootIdx,
            baseGroupby: baseGroupCols,
            groupIdx: rootIdx,
            filterIdx,
            filterLength,
            filterSet,
            filterFn,
            rowParents: this.#rowParents,
          }
        );
        const nestedGroupCount = nestedGroupRows.length;
        // this might be a performance problem for large arrays, might need to concat
        this.#groupRows.splice(i + 1, 0, ...nestedGroupRows);
        i += nestedGroupCount;
        tracker.increment(nestedGroupCount);
      } else {
        tracker.set(absDepth, groupKey);
      }
      // This has to be a pointer into sortSet NOT rows
      groupRow[IDX_POINTER] = rootIdx + 1;
    }
  }

  reduceGroupby(groupby: VuuGroupBy) {
    const { filterSet, table } = this;
    const { columnMap } = table;

    const [doomed] = findDoomedColumnDepths(groupby, this.#groupBy);
    const groupCriteria = mapGroupByToSortCriteria(this.#groupBy, columnMap);
    const [lastGroupIsDoomed, baseGroupby, addGroupby] =
      splitGroupsAroundDoomedGroup(groupCriteria, doomed);
    const { IDX, DEPTH, KEY, IDX_POINTER, PARENT_IDX, NEXT_FILTER_IDX } =
      this.meta;
    const tracker = new GroupIdxTracker(groupby.length);
    const useFilter = filterSet !== null;
    let currentGroupIdx = null;
    let i = 0;
    for (let len = this.#groupRows.length; i < len; i++) {
      const groupRow = this.#groupRows[i];
      const depth = groupRow[DEPTH];
      const groupKey = groupRow[KEY];
      const absDepth = Math.abs(depth);

      if (absDepth === doomed) {
        this.reParentLeafRows(i, currentGroupIdx);
        this.#groupRows.splice(i, 1);
        i -= 1;
        len -= 1;
        tracker.increment(1);
      } else {
        if (absDepth > doomed) {
          tracker.set(absDepth, groupKey);
          if (absDepth === doomed + 1) {
            if (lastGroupIsDoomed) {
              // our pointer will no longer be to a child group but (via the sortSet) to the data.
              // This can be taken from the first child group (which will be removed)
              groupRow[IDX_POINTER] = lowestIdxPointer(
                this.#groupRows,
                IDX_POINTER,
                DEPTH,
                i + 1,
                absDepth - 1
              );
              groupRow[NEXT_FILTER_IDX] = useFilter
                ? lowestIdxPointer(
                    this.#groupRows,
                    NEXT_FILTER_IDX,
                    DEPTH,
                    i + 1,
                    absDepth - 1
                  )
                : undefined;
            } else if (currentGroupIdx !== null) {
              const diff = this.regroupChildGroups(
                currentGroupIdx,
                i,
                baseGroupby,
                addGroupby
              );
              i -= diff;
              len -= diff;
              tracker.increment(diff);
            }
          }
          currentGroupIdx = i;
          if (tracker.hasPrevious(absDepth + 1)) {
            groupRow[PARENT_IDX] -= tracker.previous(absDepth + 1);
          }
          groupRow[DEPTH] = decrementDepth(depth);
        }
        if (tracker.idxAdjustment > 0) {
          groupRow[IDX] -= tracker.idxAdjustment;
          if (Math.abs(groupRow[DEPTH]) > 1) {
            groupRow[IDX_POINTER] -= tracker.idxAdjustment;
          }
        }
      }
    }
    if (!lastGroupIsDoomed) {
      // don't forget the final group ...
      this.regroupChildGroups(currentGroupIdx, i, baseGroupby, addGroupby);
    }
  }

  reParentLeafRows(groupIdx: number, newParentGroupIdx: number) {
    // TODO what about filterSet ?
    const {
      sortSet,
      meta: { IDX_POINTER, COUNT },
    } = this;
    const group = this.#groupRows[groupIdx];
    const idx = group[IDX_POINTER];
    const count = group[COUNT];

    for (let i = idx; i < idx + count; i++) {
      const rowIdx = sortSet[i];
      this.#rowParents[rowIdx] = newParentGroupIdx;
    }
  }

  regroupChildGroups(
    currentGroupIdx: number,
    nextGroupIdx: number,
    baseGroupby,
    addGroupby
  ) {
    const { data: rows, columns, meta, table } = this;
    const { columnMap } = table;
    const { COUNT, IDX_POINTER } = meta;
    const group = this.#groupRows[currentGroupIdx];
    const length = group[COUNT];
    const startIdx = this.#groupRows[currentGroupIdx + 1][IDX_POINTER];
    // We don't really need to go back to rows to regroup, we have partially grouped data already
    // we could perform the whole operation within groupRows
    const nestedGroupRows = groupRows(
      rows,
      this.sortSet,
      columns,
      columnMap,
      addGroupby,
      {
        startIdx,
        length,
        rootIdx: currentGroupIdx,
        baseGroupby,
        groupIdx: currentGroupIdx,
        rowParents: this.#rowParents,
      }
    );
    const existingChildNodeCount = nextGroupIdx - currentGroupIdx - 1;
    this.#groupRows.splice(
      currentGroupIdx + 1,
      existingChildNodeCount,
      ...nestedGroupRows
    );
    group[IDX_POINTER] = currentGroupIdx + 1;
    return existingChildNodeCount - nestedGroupRows.length;
  }

  // Note: this assumes no leaf rows visible. Is that always valid ?
  // NOt after removing a groupBy ! Not after a filter
  countVisibleRows(groupRows: VuuDataRow[], usingFilter = false) {
    const { DEPTH, COUNT, FILTER_COUNT } = this.meta;
    let count = 0;
    for (let i = 0, len = groupRows.length; i < len; i++) {
      const zeroCount = usingFilter && groupRows[i][FILTER_COUNT] === 0;
      if (!zeroCount) {
        count += 1;
      }
      const depth = groupRows[i][DEPTH] as number;
      if (depth < 0 || zeroCount) {
        while (
          i < len - 1 &&
          Math.abs(groupRows[i + 1][DEPTH] as number) < -depth
        ) {
          i += 1;
        }
      } else if (depth === 1) {
        count += usingFilter
          ? (groupRows[i][FILTER_COUNT] as number)
          : (groupRows[i][COUNT] as number);
      }
    }
    return count;
  }
}
