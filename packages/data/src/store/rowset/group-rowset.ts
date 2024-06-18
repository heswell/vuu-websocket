import { mapSortDefsToSortCriteria } from '../sortUtils.js';
import { extendsFilter, functor as filterPredicate } from '../filter.js';
import GroupIterator from '../groupIterator.js';
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
  SimpleTracker,
  splitGroupsAroundDoomedGroup
} from '../groupUtils.js';
import { NULL_RANGE } from '../rangeUtils.js';
import { sortBy, sortPosition } from '../sortUtils.js';
import { ASC } from '../types.js';
import { BaseRowSet } from './rowSet.js';

const EMPTY_ARRAY = [];

export class GroupRowSet extends BaseRowSet {
  constructor(rowSet, columns, groupby, sortCriteria = null, filter = rowSet.currentFilter) {
    super(rowSet.table, columns, rowSet.baseOffset);
    this.groupby = groupby;
    this.groupState = groupState;
    this.aggregations = [];
    this.currentLength = 0; // TODO
    this.groupRows = [];
    this.aggregatedColumn = {};

    this.collapseChildGroups = this.collapseChildGroups.bind(this);
    this.countChildGroups = this.countChildGroups.bind(this);

    columns.forEach((column) => {
      if (column.aggregate) {
        const key = rowSet.columnMap[column.name];
        this.aggregations.push([key, column.aggregate]); // why ?
        this.aggregatedColumn[key] = column.aggregate;
      }
    });
    this.expandedByDefault = false;
    this.sortCriteria = Array.isArray(sortCriteria) && sortCriteria.length ? sortCriteria : null;

    // can we lazily build the sortSet as we fetch data for the first time ?
    this.sortSet = rowSet.data.map((d, i) => i);
    // we will store an array of pointers to parent Groups.mirroring sequence of leaf rows
    this.rowParents = Array(rowSet.data.length);

    this.applyGroupby(groupby);

    const [navSet, IDX, COUNT] = this.selectNavigationSet(false);
    // TODO roll the IDX and COUNT overrides into meta
    this.iter = GroupIterator(this.groupRows, navSet, this.data, IDX, COUNT, this.meta);

    if (filter) {
      this.filter(filter);
    }
  }

  get length() {
    return this.currentLength;
  }
  get first() {
    return this.data[0];
  }
  get last() {
    return this.data[this.data.length - 1];
  }

  currentRange() {
    return this.setRange(this.range, false);
  }

  setRange(range, useDelta = true) {
    const [rowsInRange, idx] =
      !useDelta && range.lo === this.range.lo && range.hi === this.range.hi
        ? this.iter.currentRange()
        : this.iter.setRange(range, useDelta);

    const filterCount = this.filterSet && this.meta.FILTER_COUNT;
    const rows = rowsInRange.map((row, i) => this.cloneRow(row, idx + i, filterCount));
    this.range = range;
    return {
      rows,
      range,
      size: this.length,
      offset: this.offset,
      selectedIndices: this.selectedIndices
    };
  }

  cloneRow(row, idx, FILTER_COUNT) {
    const { IDX, DEPTH, COUNT } = this.meta;
    const dolly = row.slice();
    dolly[IDX] = idx + this.offset;

    if (FILTER_COUNT && dolly[DEPTH] !== 0 && typeof dolly[FILTER_COUNT] === 'number') {
      dolly[COUNT] = dolly[FILTER_COUNT];
    }
    return dolly;
  }

  applyGroupby(groupby, rows = this.data) {
    const { columns } = this;
    this.groupRows.length = 0;
    const groupCols = mapSortDefsToSortCriteria(groupby, this.columnMap);
    this.groupRows = groupRows(rows, this.sortSet, columns, this.columnMap, groupCols, {
      groups: this.groupRows,
      rowParents: this.rowParents
    });
    this.currentLength = this.countVisibleRows(this.groupRows);
  }

  groupBy(groupby) {
    if (groupbySortReversed(groupby, this.groupby)) {
      this.sortGroupby(groupby);
    } else if (groupbyExtendsExistingGroupby(groupby, this.groupby)) {
      this.extendGroupby(groupby);
      this.currentLength = this.countVisibleRows(this.groupRows, this.filterSet !== null);
    } else if (groupbyReducesExistingGroupby(groupby, this.groupby)) {
      this.reduceGroupby(groupby);
      this.range = NULL_RANGE;
      this.iter.clear();
      this.currentLength = this.countVisibleRows(this.groupRows, this.filterSet !== null);
    } else {
      this.applyGroupby(groupby);
    }
    this.groupby = groupby;
  }

  // User interaction will never produce more than one change, but programatic change might !
  //TODO if we have sortCriteria, apply to leaf rows as we expand
  setGroupState(groupState) {
    // onsole.log(`[groupRowSet.setGroupState] ${JSON.stringify(groupState,null,2)}`)
    const changes = getGroupStateChanges(groupState, this.groupState);
    changes.forEach(([key, , isExpanded]) => {
      const { groupRows } = this;
      if (key === '*') {
        this.toggleAll(isExpanded);
        this.currentLength = this.countVisibleRows(groupRows, false);
      } else {
        const groupIdx = this.findGroupIdx(key);
        if (groupIdx !== -1) {
          if (isExpanded) {
            this.currentLength += this.expandGroup(groupIdx, groupRows);
          } else {
            this.currentLength -= this.collapseGroup(groupIdx, groupRows);
          }
        } else {
          console.warn(`setGroupState could not find row to toggle`);
        }
      }
    });
    this.groupState = groupState;
  }

  expandGroup(idx, groups) {
    return this.toggleGroup(idx, groups, this.countChildGroups);
  }

  collapseGroup(idx, groups) {
    return this.toggleGroup(idx, groups, this.collapseChildGroups);
  }

  toggleGroup(groupIdx, groupRows, processChildGroups) {
    const { DEPTH, COUNT, FILTER_COUNT } = this.meta;
    let adjustment = 0;
    const groupRow = groupRows[groupIdx];
    const depth = groupRow[DEPTH];
    const useFilter = this.filterSet !== null;
    groupRow[DEPTH] = -depth;
    if (Math.abs(depth) === 1) {
      const COUNT_IDX = useFilter ? FILTER_COUNT : COUNT;
      adjustment = groupRow[COUNT_IDX];
    } else {
      adjustment = processChildGroups(Math.abs(depth) - 1, groupIdx + 1, groupRows, useFilter);
    }
    return adjustment;
  }

  countChildGroups(childDepth, startIdx, groupRows, useFilter) {
    const { DEPTH, FILTER_COUNT } = this.meta;
    let adjustment = 0;
    for (let i = startIdx; i < groupRows.length; i++) {
      const nextDepth = groupRows[i][DEPTH];
      if (Math.abs(nextDepth) === childDepth) {
        if (!useFilter || groupRows[i][FILTER_COUNT] > 0) {
          adjustment += 1;
        }
      } else if (Math.abs(nextDepth) > childDepth) {
        break;
      }
    }
    return adjustment;
  }

  collapseChildGroups(childDepth, startIdx, groupRows, useFilter) {
    const { DEPTH, FILTER_COUNT } = this.meta;
    let adjustment = 0;
    for (let i = startIdx; i < groupRows.length; i++) {
      const nextDepth = groupRows[i][DEPTH];
      if (Math.abs(nextDepth) === childDepth) {
        if (!useFilter || groupRows[i][FILTER_COUNT] > 0) {
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
  }

  sort(sortCriteria) {
    const { groupRows: groups } = this;
    const { IDX, DEPTH, COUNT, IDX_POINTER } = this.meta;
    this.sortCriteria = Array.isArray(sortCriteria) && sortCriteria.length ? sortCriteria : null;

    const sortCols = mapSortDefsToSortCriteria(sortCriteria, this.columnMap);
    //TODO only need to handle visible rows
    for (let i = 0; i < groups.length; i++) {
      const groupRow = groups[i];
      const depth = groupRow[DEPTH];
      const count = groupRow[COUNT];
      const absDepth = Math.abs(depth);
      const sortIdx = groupRow[IDX_POINTER];
      if (absDepth === 1) {
        this.sortDataSubset(sortIdx, count, sortCols, IDX);
      }
    }
  }

  sortDataSubset(startIdx, length, sortCriteria, IDX) {
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
    this.currentFilter = null;
    this.filterSet = null;
    // rebuild agregations for groups where filter count is less than count, remove filter count
    const { data: rows, groupRows: groups, sortSet, columns } = this;
    const { COUNT, FILTER_COUNT, NEXT_FILTER_IDX } = this.meta;
    const aggregations = findAggregatedColumns(columns, this.columnMap, this.groupby);

    for (let i = 0; i < groups.length; i++) {
      let groupRow = groups[i];
      if (typeof groupRow[FILTER_COUNT] === 'number' && groupRow[COUNT] > groupRow[FILTER_COUNT]) {
        aggregateGroup(groups, i, sortSet, rows, columns, aggregations);
        groupRow[FILTER_COUNT] = null;
        groupRow[NEXT_FILTER_IDX] = null;
      }
    }

    this.iter.setNavSet(this.selectNavigationSet(false));
    this.currentLength = this.countVisibleRows(groups, false);
  }

  filter(filter) {
    const extendsCurrentFilter = extendsFilter(this.currentFilter, filter);
    const fn = filter && filterPredicate(this.columnMap, filter);
    const { COUNT, DEPTH, PARENT_IDX, FILTER_COUNT, NEXT_FILTER_IDX } = this.meta;
    const { data: rows, groupRows: groups } = this;
    let [navSet, NAV_IDX, NAV_COUNT] = this.selectNavigationSet(
      extendsCurrentFilter && this.filterSet
    );
    const newFilterSet = [];

    for (let i = 0; i < groups.length; i++) {
      let groupRow = groups[i];
      const depth = groupRow[DEPTH];
      const count = getCount(groupRow, NAV_COUNT, COUNT);
      const absDepth = Math.abs(depth);

      if (absDepth === 1) {
        const sortIdx = groupRow[NAV_IDX];
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
        let aggregations = EMPTY_ARRAY;
        // we cannot be sure what filter changes have taken effect, so we must recalculate aggregations
        if (this.aggregations.length) {
          aggregations = this.aggregations.map(([i, a]) => [i, a, 0]);
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
            if (type === 'sum') {
              groupRow[colIdx] = sum;
            } else if (type === 'avg') {
              groupRow[colIdx] = sum / rowCount;
            }
          });
        }

        // update parent counts
        if (rowCount > 0) {
          while (groupRow[PARENT_IDX] !== null) {
            groupRow = groups[groupRow[PARENT_IDX]];

            aggregations.forEach((aggregation) => {
              const [colIdx, type, sum] = aggregation;
              if (type === 'sum') {
                groupRow[colIdx] += sum;
              } else if (type === 'avg') {
                const originalCount = groupRow[FILTER_COUNT];
                const originalSum = originalCount * groupRow[colIdx];
                groupRow[colIdx] = (originalSum + sum) / (originalCount + rowCount);
              }
            });
            groupRow[FILTER_COUNT] += rowCount;
          }
        }
      } else {
        // Higher-level group aggregations are calculated from lower level groups
        // initialize aggregated columns
        groupRow[FILTER_COUNT] = 0;
        this.aggregations.forEach((aggregation) => {
          const [colIdx] = aggregation;
          groupRow[colIdx] = 0;
        });
      }
    }
    this.filterSet = newFilterSet;
    this.currentFilter = filter;
    this.currentLength = this.countVisibleRows(this.groupRows, true);

    this.iter.setNavSet(this.selectNavigationSet(true));
  }

  update(rowIdx, updates) {
    const {
      groupRows: groups,
      offset,
      rowParents,
      range: { lo }
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

      let grpIdx = rowParents[rowIdx];
      // this seems to return 0 an awful lot
      let ii = 0;

      // If this column is being aggregated
      if (this.aggregatedColumn[colIdx]) {
        groupUpdates = groupUpdates || [];
        // collect adjusted aggregations for each group level
        do {
          let groupRow = groups[grpIdx];

          let originalGroupValue = groupRow[colIdx];
          const diff = value - originalValue;
          const type = this.aggregatedColumn[colIdx];
          if (type === 'sum') {
            // ... wnd in the groupRow we have a further offset of 2 ...
            groupRow[colIdx] += diff; // again with the +2
          } else if (type === 'avg') {
            const count = getCount(groupRow, FILTER_COUNT, COUNT);
            groupRow[colIdx] = (groupRow[colIdx] * count + diff) / count;
          }

          (groupUpdates[ii] || (groupUpdates[ii] = [grpIdx])).push(
            colIdx,
            originalGroupValue,
            groupRow[colIdx]
          );

          grpIdx = groupRow[PARENT_IDX];
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
        const rangeIdx = this.iter.getRangeIndexOfGroup(grpIdx);
        if (rangeIdx !== -1) {
          outgoingUpdates.push([lo + rangeIdx + offset, ...updates]);
        }
      }
    }
    const rangeIdx = this.iter.getRangeIndexOfRow(rowIdx);
    if (rangeIdx !== -1) {
      // onsole.log(`[GroupRowSet.update] updates for row idx ${idx} ${rangeIdx+offset} ${JSON.stringify(rowUpdates)}`)
      outgoingUpdates.push([lo + rangeIdx + offset, ...rowUpdates]);
    }

    return outgoingUpdates;
  }

  insert(newRowIdx, row) {
    // TODO look at append and idx manipulation for insertion at head.
    const { groupRows: groups, groupby, data: rows, sortSet, columns, meta, iter: iterator } = this;
    let groupCols = mapSortDefsToSortCriteria(groupby, this.columnMap);
    const groupPositions = findGroupPositions(groups, groupCols, row);
    const { IDX, COUNT, KEY, IDX_POINTER } = meta;
    const GROUP_KEY_SORT = [[KEY, 'asc']];
    const allGroupsExist = groupPositions.length === groupby.length;
    const noGroupsExist = groupPositions.length === 0;
    const someGroupsExist = !noGroupsExist && !allGroupsExist;
    let result;
    let newGroupIdx = null;

    if (allGroupsExist) {
      // all necessary groups are already in place, we will just insert a row and update counts/aggregates
      let grpIdx = groupPositions[groupPositions.length - 1];
      const groupRow = groups[grpIdx];
      this.rowParents[newRowIdx] = grpIdx;
      let count = groupRow[COUNT];

      const insertionPoint = groupRow[IDX_POINTER] + count;
      // all existing pointers from the insertionPoint forward are going to be displaced by +1
      adjustLeafIdxPointers(groups, insertionPoint, meta);
      sortSet.splice(insertionPoint, 0, row[IDX]);
      if (allGroupsExpanded(groups, groupRow, meta)) {
        this.currentLength += 1;
      }
    } else {
      newGroupIdx = sortPosition(
        groups,
        sortBy(GROUP_KEY_SORT),
        expandRow(groupCols, row, meta),
        'last-available'
      );
      sortSet.push(newRowIdx);
      let nestedGroups, baseGroupby, rootIdx;

      if (someGroupsExist) {
        baseGroupby = groupCols.slice(0, groupPositions.length);
        rootIdx = groups[groupPositions[groupPositions.length - 1]][IDX];
        groupCols = groupCols.slice(groupPositions.length);
      }

      nestedGroups = groupRows(rows, sortSet, columns, this.columnMap, groupCols, {
        startIdx: sortSet.length - 1,
        length: 1,
        groupIdx: newGroupIdx - 1,
        baseGroupby,
        rootIdx
      });

      adjustGroupIndices(groups, newGroupIdx, meta, nestedGroups.length);
      groups.splice.apply(groups, [newGroupIdx, 0].concat(nestedGroups));
    }

    this.incrementGroupCounts(groupPositions);
    this.updateAggregatedValues(groupPositions, row);

    iterator.refresh(); // force iterator to rebuild rangePositions
    let rangeIdx = allGroupsExist
      ? iterator.getRangeIndexOfRow(newRowIdx)
      : iterator.getRangeIndexOfGroup(newGroupIdx);

    if (rangeIdx !== -1) {
      // New row is visible within viewport so we will force render all rows
      result = { replace: true };
      if (newGroupIdx !== null) {
        this.currentLength += 1;
      }
    } else if (noGroupsExist === false) {
      // new row is not visible as group is collapsed, but we need to update groiup row(s)
      result = { updates: this.collectGroupUpdates(groupPositions) };
    }

    return result;
  }

  incrementGroupCounts(groupPositions) {
    const {
      groupRows: groups,
      meta: { COUNT }
    } = this;
    groupPositions.forEach((grpIdx) => {
      const group = groups[grpIdx];
      group[COUNT] += 1;
    });
  }

  updateAggregatedValues(groupPositions, row) {
    const { groupRows: groups } = this;

    groupPositions.forEach((grpIdx) => {
      const group = groups[grpIdx];
      for (let [key, type] of this.aggregations) {
        const value = row[key];
        const groupValue = group[key];
        if (type === 'sum') {
          group[key] = groupValue + value;
        }
      }
    });
  }

  collectGroupUpdates(groupPositions) {
    const {
      aggregations,
      groupRows: groups,
      meta: { COUNT },
      offset
    } = this;
    const updates = [];
    for (let grpIdx of groupPositions) {
      const rangeIdx = this.iter.getRangeIndexOfGroup(grpIdx);
      if (rangeIdx !== -1) {
        const group = groups[grpIdx];
        const update = [rangeIdx + offset, COUNT, group[COUNT]];
        for (let [key] of aggregations) {
          update.push(key, group[key]);
        }
        updates.push(update);
      }
    }
    return updates;
  }

  // start with a simplesequential search
  findGroupIdx(groupKey) {
    const { groupRows, meta } = this;
    for (let i = 0; i < groupRows.length; i++) {
      if (groupRows[i][meta.KEY] === groupKey) {
        return i;
      }
    }
    return -1;
  }

  //TODO simple implementation first
  toggleAll(isExpanded) {
    const sign = isExpanded ? 1 : -1;
    // iterate groupedRows and make every group row depth positive,
    // Then visible rows is not going to be different from grouped rows
    const { DEPTH } = this.meta;
    const { groupRows: groups } = this;
    this.expandedByDefault = isExpanded;
    for (let i = 0, len = groups.length; i < len; i++) {
      const depth = groups[i][DEPTH];
      // if (depth !== 0) {
      groups[i][DEPTH] = Math.abs(depth) * sign;
      // }
    }
  }

  sortGroupby(groupby) {
    const { IDX, KEY, DEPTH, IDX_POINTER, PARENT_IDX } = this.meta;
    const { groupRows: groups } = this;
    const groupCols = mapSortDefsToSortCriteria(groupby, this.columnMap);
    const [colIdx, depth] = findSortedCol(groupby, this.groupby);
    let count = 0;
    let i = 0;
    for (; i < groups.length; i++) {
      if (Math.abs(groups[i][DEPTH]) > depth) {
        if (count > 0) {
          this.sortGroupRowsSubset(groupCols, colIdx, i - count, count);
          count = 0;
        }
      } else {
        count += 1;
      }
    }

    this.sortGroupRowsSubset(groupCols, colIdx, i - count, count);

    const tracker = new SimpleTracker(groupby.length);
    this.groupRows.forEach((groupRow, i) => {
      const depth = groupRow[DEPTH];
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

  sortGroupRowsSubset(groupby, colIdx, startPos = 0, length = this.groupRows.length) {
    const { groupRows: groups } = this;
    let insertPos = startPos + length;
    const [groupColIdx, direction] = groupby[colIdx];
    const before = (k1, k2) => (direction === ASC ? k2 > k1 : k1 > k2);
    const after = (k1, k2) => (direction === ASC ? k2 < k1 : k1 < k2);
    let currentKey = null;
    for (let i = startPos; i < startPos + length; i++) {
      const key = groups[i][groupColIdx];
      if (currentKey === null) {
        currentKey = key;
      } else if (before(key, currentKey)) {
        const splicedRows = groups.splice(startPos, i - startPos);
        insertPos -= splicedRows.length;
        groups.splice.apply(groups, [insertPos, 0].concat(splicedRows));
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
  extendGroupby(groupby) {
    const groupCols = mapSortDefsToSortCriteria(groupby, this.columnMap);
    const baseGroupCols = groupCols.slice(0, this.groupby.length);
    const newGroupbyClause = groupCols.slice(this.groupby.length);
    const {
      groupRows: groups,
      groupby: baseGroupby,
      data: rows,
      columns,
      sortSet,
      filterSet,
      meta
    } = this;
    const { IDX_POINTER, PARENT_IDX, NEXT_FILTER_IDX } = meta;
    const baseLevels = baseGroupby.length;
    const tracker = new GroupIdxTracker(baseLevels - 1);
    const filterFn = this.currentFilter
      ? filterPredicate(this.columnMap, this.currentFilter)
      : null;

    // we are going to insert new rows into groupRows and update the PARENT_IDX pointers in data rows
    for (let i = 0; i < groups.length; i++) {
      const groupRow = groups[i];
      if (tracker.idxAdjustment) {
        groupRow[meta.IDX] += tracker.idxAdjustment;
      }

      const rootIdx = groupRow[meta.IDX];
      const depth = groupRow[meta.DEPTH];
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
          this.columnMap,
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
            rowParents: this.rowParents
          }
        );
        const nestedGroupCount = nestedGroupRows.length;
        // this might be a performance problem for large arrays, might need to concat
        groups.splice(i + 1, 0, ...nestedGroupRows);
        i += nestedGroupCount;
        tracker.increment(nestedGroupCount);
      } else {
        tracker.set(absDepth, groupKey);
      }
      // This has to be a pointer into sortSet NOT rows
      groupRow[IDX_POINTER] = rootIdx + 1;
    }
  }

  reduceGroupby(groupby) {
    const { groupRows: groups, filterSet } = this;
    const [doomed] = findDoomedColumnDepths(groupby, this.groupby);
    const groupCols = mapSortDefsToSortCriteria(this.groupby, this.columnMap);
    const [lastGroupIsDoomed, baseGroupby, addGroupby] = splitGroupsAroundDoomedGroup(
      groupCols,
      doomed
    );
    const { IDX, DEPTH, KEY, IDX_POINTER, PARENT_IDX, NEXT_FILTER_IDX } = this.meta;
    const tracker = new GroupIdxTracker(groupby.length);
    const useFilter = filterSet !== null;
    let currentGroupIdx = null;
    let i = 0;
    for (let len = groups.length; i < len; i++) {
      const groupRow = groups[i];
      const depth = groupRow[DEPTH];
      const groupKey = groupRow[KEY];
      const absDepth = Math.abs(depth);

      if (absDepth === doomed) {
        this.reParentLeafRows(i, currentGroupIdx);
        groups.splice(i, 1);
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
                groups,
                IDX_POINTER,
                DEPTH,
                i + 1,
                absDepth - 1
              );
              groupRow[NEXT_FILTER_IDX] = useFilter
                ? lowestIdxPointer(groups, NEXT_FILTER_IDX, DEPTH, i + 1, absDepth - 1)
                : undefined;
            } else if (currentGroupIdx !== null) {
              const diff = this.regroupChildGroups(currentGroupIdx, i, baseGroupby, addGroupby);
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

  reParentLeafRows(groupIdx, newParentGroupIdx) {
    // TODO what about filterSet ?
    const {
      groupRows: groups,
      rowParents,
      sortSet,
      meta: { IDX_POINTER, COUNT }
    } = this;
    const group = groups[groupIdx];
    const idx = group[IDX_POINTER];
    const count = group[COUNT];

    for (let i = idx; i < idx + count; i++) {
      const rowIdx = sortSet[i];
      rowParents[rowIdx] = newParentGroupIdx;
    }
  }

  regroupChildGroups(currentGroupIdx, nextGroupIdx, baseGroupby, addGroupby) {
    const { groupRows: groups, data: rows, columns, meta } = this;
    const { COUNT, IDX_POINTER } = meta;
    const group = groups[currentGroupIdx];
    const length = group[COUNT];
    const startIdx = groups[currentGroupIdx + 1][IDX_POINTER];
    // We don't really need to go back to rows to regroup, we have partially grouped data already
    // we could perform the whole operation within groupRows
    const nestedGroupRows = groupRows(rows, this.sortSet, columns, this.columnMap, addGroupby, {
      startIdx,
      length,
      rootIdx: currentGroupIdx,
      baseGroupby,
      groupIdx: currentGroupIdx,
      rowParents: this.rowParents
    });
    const existingChildNodeCount = nextGroupIdx - currentGroupIdx - 1;
    groups.splice(currentGroupIdx + 1, existingChildNodeCount, ...nestedGroupRows);
    group[IDX_POINTER] = currentGroupIdx + 1;
    return existingChildNodeCount - nestedGroupRows.length;
  }

  // Note: this assumes no leaf rows visible. Is that always valid ?
  // NOt after removing a groupBy ! Not after a filter
  countVisibleRows(groupRows, usingFilter = false) {
    const { DEPTH, COUNT, FILTER_COUNT } = this.meta;
    let count = 0;
    for (let i = 0, len = groupRows.length; i < len; i++) {
      const zeroCount = usingFilter && groupRows[i][FILTER_COUNT] === 0;
      if (!zeroCount) {
        count += 1;
      }
      const depth = groupRows[i][DEPTH];
      if (depth < 0 || zeroCount) {
        while (i < len - 1 && Math.abs(groupRows[i + 1][DEPTH]) < -depth) {
          i += 1;
        }
      } else if (depth === 1) {
        count += usingFilter ? groupRows[i][FILTER_COUNT] : groupRows[i][COUNT];
      }
    }
    return count;
  }
}
