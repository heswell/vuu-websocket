import { VuuRange } from "@vuu-ui/vuu-protocol-types";
import { getCount } from "./groupUtils.js";
import {
  compareRanges,
  getDeltaRange,
  getFullRange,
  NULL_RANGE,
  RangeFlags,
} from "./rangeUtils.js";
import { VuuDataRow } from "./rowset/rowSet.js";
import { ColumnMetaData } from "./columnUtils.js";

type IterTuple = [VuuDataRow | null, number, number];

const RANGE_POS_TUPLE_SIZE = 4;
const NO_RESULT: IterTuple = [null, -1, -1];

type IterateMethod = (
  groups: VuuDataRow[],
  rows: VuuDataRow[],
  grpIdx: number,
  rowIdx: number,
  navSet: any,
  NAV_IDX: number,
  NAV_COUNT: number,
  meta: ColumnMetaData
) => IterTuple;

export interface IIterator {
  direction: IterationDirection;
  rangePositions: any;
  currentRange: () => [VuuDataRow[], number];
  clear: () => void;
  setRange: (range: VuuRange, useDelta?: boolean) => [VuuDataRow[], number];
  next: IterateMethod;
  previous: IterateMethod;
}

/**
 * RangePosition = [Row, groupIndex, rowIndex]
 */
type RangePosition = [number, number, number];

type IterationDirection = 0 | 1;
export const FORWARDS: IterationDirection = 0;
export const BACKWARDS: IterationDirection = 1;

export interface GroupIteratorProps {
  groupRows: VuuDataRow[];
  navSet: number[];
  data: VuuDataRow[];
  NAV_IDX: number;
  NAV_COUNT: number;
  meta: ColumnMetaData;
  range: VuuRange;
}

export class GroupIterator implements IIterator {
  #data: VuuDataRow[];
  #direction: IterationDirection = FORWARDS;
  #idx = 0;
  #grpIdx = -1;
  #groupRows: VuuDataRow[];
  #meta: ColumnMetaData;
  #navCount: number;
  #navIdx: number;
  #navSet: any;
  #range: VuuRange;
  #rangePositions: number[] = [];
  #rangePositionLo: RangePosition = [0, -1, -1];
  #rangePositionHi: RangePosition = [-1, -1, -1];
  #rowIdx = -1;

  constructor({
    groupRows,
    navSet,
    data,
    NAV_IDX,
    NAV_COUNT,
    meta,
    range,
  }: GroupIteratorProps) {
    this.#data = data;
    this.#groupRows = groupRows;
    this.#meta = meta;
    this.#navCount = NAV_COUNT;
    this.#navIdx = NAV_IDX;
    this.#navSet = navSet;
    this.#range = range;
  }

  get direction() {
    return this.#direction;
  }

  get rangePositions() {
    return this.#rangePositions;
  }

  currentRange(): [VuuDataRow[], number] {
    const rows = [];
    const { IDX } = this.#meta;
    [this.#idx, this.#grpIdx, this.#rowIdx] = this.#rangePositionLo;
    if (this.#idx === 0 && this.#grpIdx === -1 && this.#rowIdx === -1) {
      this.#idx = -1;
    }
    this.#rangePositions.length = 0;

    let startIdx = this.#idx;
    let row;
    let i = this.#range.from;
    do {
      this.#direction = FORWARDS;
      [row, this.#grpIdx, this.#rowIdx] = this.next(
        this.#groupRows,
        this.#data,
        this.#grpIdx,
        this.#rowIdx,
        this.#navSet,
        this.#navIdx,
        this.#navCount,
        this.#meta
      );
      if (row) {
        rows.push(row);
        this.#idx += 1;
        const absRowIdx = this.#rowIdx === -1 ? -1 : (row[IDX] as number);
        this.#rangePositions.push(
          this.#idx,
          this.#grpIdx,
          this.#rowIdx,
          absRowIdx
        );
        i += 1;
      }
    } while (row && i < this.#range.to);
    if (row) {
      this.#direction = FORWARDS;
      const [grpIdx, rowIdx] = [this.#grpIdx, this.#rowIdx];
      [row, this.#grpIdx, this.#rowIdx] = this.next(
        this.#groupRows,
        this.#data,
        this.#grpIdx,
        this.#rowIdx,
        this.#navSet,
        this.#navIdx,
        this.#navCount,
        this.#meta
      );
      this.#idx += 1;
      this.#rangePositionHi = [
        row ? this.#idx : -1,
        this.#grpIdx,
        this.#rowIdx,
      ];
      [this.#grpIdx, this.#rowIdx] = [grpIdx, rowIdx];
    } else {
      this.#rangePositionHi = [-1, -1, -1];
    }

    return [rows, startIdx + 1];
  }

  setRange(range: VuuRange, useDelta = true): [VuuDataRow[], number] {
    const rangeDiff = compareRanges(this.#range, range);
    const { from: resultLo, to: resultHi } = useDelta
      ? getDeltaRange(this.#range, range)
      : getFullRange(range);
    const { IDX } = this.#meta;

    if (rangeDiff === RangeFlags.NULL) {
      this.#rangePositionLo = [0, -1, -1];
      this.#rangePositionHi = [-1, -1, -1];
      this.#rangePositions.length = 0;
      return [[], -1];
    } else if (range.from === this.#range.from && useDelta === false) {
      // when we're asked for the same range again, rebuild the range
      [this.#idx, this.#grpIdx, this.#rowIdx] = this.#rangePositionLo;
      this.#rangePositions.length = 0;
    } else {
      if (this.#direction === FORWARDS && rangeDiff & RangeFlags.BWD) {
        [this.#idx, this.#grpIdx, this.#rowIdx] = this.#rangePositions;
      } else if (this.#direction === BACKWARDS && rangeDiff & RangeFlags.FWD) {
        [this.#idx, this.#grpIdx, this.#rowIdx] = this.#rangePositions.slice(
          -RANGE_POS_TUPLE_SIZE
        );
        this.#idx += 1;
      }

      if (rangeDiff === RangeFlags.FWD) {
        this.skip(range.from - this.#range.to, this.next);
        this.#rangePositions.length = 0;
      } else if (rangeDiff === RangeFlags.BWD) {
        this.skip(this.#range.from - range.to, this.previous);
        this.#rangePositions.length = 0;
      }

      const loDiff = range.from - this.#range.from;
      const hiDiff = this.#range.to - range.to;
      // allow for a range that overshoots data
      const missingQuota =
        this.#range.to -
        this.#range.from -
        this.#rangePositions.length / RANGE_POS_TUPLE_SIZE;

      if (loDiff > 0) {
        const removed = this.#rangePositions.splice(
          0,
          loDiff * RANGE_POS_TUPLE_SIZE
        );
        if (removed.length) {
          this.#rangePositionLo = removed.slice(
            -RANGE_POS_TUPLE_SIZE
          ) as RangePosition;

          // experiment - is this A) always correct B) enough
          if (useDelta === false) {
            [this.#idx, this.#grpIdx, this.#rowIdx] = this.#rangePositionLo;
          }
        }
      }
      if (hiDiff > 0) {
        //TODO allow for scenatio where both lo and HI have changed
        if (hiDiff > missingQuota) {
          const absDiff = hiDiff - missingQuota;
          const removed = this.#rangePositions.splice(
            -absDiff * RANGE_POS_TUPLE_SIZE,
            absDiff * RANGE_POS_TUPLE_SIZE
          );
          if (removed.length) {
            this.#rangePositionHi = removed.slice(
              0,
              RANGE_POS_TUPLE_SIZE
            ) as RangePosition;
          }
        }
      }
    }

    const rows = [];
    let row;
    let startIdx = -1;

    if ((rangeDiff & RangeFlags.REDUCE) === 0) {
      if (rangeDiff & RangeFlags.FWD || rangeDiff === RangeFlags.SAME) {
        let i = resultLo;
        startIdx = this.#idx;
        do {
          this.#direction = FORWARDS;
          [row, this.#grpIdx, this.#rowIdx] = this.next(
            this.#groupRows,
            this.#data,
            this.#grpIdx,
            this.#rowIdx,
            this.#navSet,
            this.#navIdx,
            this.#navCount,
            this.#meta
          );
          if (row) {
            rows.push(row);
            const absRowIdx = this.#rowIdx === -1 ? -1 : (row[IDX] as number);
            this.#rangePositions.push(
              this.#idx,
              this.#grpIdx,
              this.#rowIdx,
              absRowIdx
            );
            i += 1;
            this.#idx += 1;
          }
        } while (row && i < resultHi);
        if (row) {
          this.#direction = FORWARDS;
          const [grpIdx, rowIdx] = [this.#grpIdx, this.#rowIdx];
          [row, this.#grpIdx, this.#rowIdx] = this.next(
            this.#groupRows,
            this.#data,
            this.#grpIdx,
            this.#rowIdx,
            this.#navSet,
            this.#navIdx,
            this.#navCount,
            this.#meta
          );
          this.#rangePositionHi = [
            row ? this.#idx : -1,
            this.#grpIdx,
            this.#rowIdx,
          ];
          [this.#grpIdx, this.#rowIdx] = [grpIdx, rowIdx];
        } else {
          this.#rangePositionHi = [-1, -1, -1];
        }
      } else {
        let i = resultHi - 1;
        do {
          this.#direction = BACKWARDS;
          [row, this.#grpIdx, this.#rowIdx] = this.previous(
            this.#groupRows,
            this.#data,
            this.#grpIdx,
            this.#rowIdx,
            this.#navSet,
            this.#navIdx,
            this.#navCount,
            this.#meta
          );
          if (row) {
            this.#idx -= 1;
            rows.unshift(row);
            const absRowIdx = this.#rowIdx === -1 ? -1 : (row[IDX] as number);
            this.#rangePositions.unshift(
              this.#idx,
              this.#grpIdx,
              this.#rowIdx,
              absRowIdx
            );
            i -= 1;
          }
        } while (row && i >= resultLo);
        startIdx = this.#idx;
        if (row) {
          const [grpIdx, rowIdx] = [this.#grpIdx, this.#rowIdx];
          this.#direction = BACKWARDS;
          [row, this.#grpIdx, this.#rowIdx] = this.previous(
            this.#groupRows,
            this.#data,
            this.#grpIdx,
            this.#rowIdx,
            this.#navSet,
            this.#navIdx,
            this.#navCount,
            this.#meta
          );
          this.#rangePositionLo = [
            row ? this.#idx - 1 : 0,
            this.#grpIdx,
            this.#rowIdx,
          ];
          [this.#grpIdx, this.#rowIdx] = [grpIdx, rowIdx];
        } else {
          this.#rangePositionLo = [0, -1, -1];
        }
      }
    } else {
      // reduced range, adjust the current pos. DIrection can only be a guess, but if it's wrong
      // the appropriate adjustment will be made nest time range is set
      if (rangeDiff & RangeFlags.FWD) {
        console.log(`adjust the idx`);
        [this.#idx, this.#grpIdx, this.#rowIdx] = this.#rangePositions.slice(
          -RANGE_POS_TUPLE_SIZE
        );
        this.#idx += 1;
      } else {
        [this.#idx, this.#grpIdx, this.#rowIdx] = this.#rangePositions;
      }
    }

    this.#range = range;
    return [rows, startIdx];
  }

  clear() {
    this.#idx = 0;
    this.#grpIdx = -1;
    this.#rowIdx = -1;
    this.#direction = FORWARDS;
    this.#range = NULL_RANGE;
    this.#rangePositionLo = [0, -1, -1];
    this.#rangePositions = [];
    this.#rangePositionHi = [-1, -1, -1];
  }

  next: IterateMethod = (
    groups,
    rows,
    grpIdx,
    rowIdx,
    navSet,
    NAV_IDX,
    NAV_COUNT,
    meta
  ): IterTuple => {
    if (grpIdx === -1) {
      do {
        grpIdx += 1;
      } while (
        grpIdx < groups.length &&
        getCount(groups[grpIdx], NAV_COUNT) === 0
      );

      if (grpIdx >= groups.length) {
        return NO_RESULT;
      } else {
        return [groups[grpIdx], grpIdx, -1];
      }
    } else if (grpIdx >= groups.length) {
      return NO_RESULT;
    } else {
      let groupRow = groups[grpIdx];
      const depth = groupRow[meta.DEPTH] as number;
      const count = getCount(groupRow, NAV_COUNT);
      // Note: we're unlikely to be passed the row if row count is zero
      if (depth === 1 && count !== 0 && (rowIdx === -1 || rowIdx < count - 1)) {
        rowIdx = rowIdx === -1 ? 0 : rowIdx + 1;
        const absRowIdx = getAbsRowIdx(groupRow, rowIdx, navSet, NAV_IDX);
        // the equivalent of project row
        const row = rows[absRowIdx].slice();
        row[meta.IDX] = absRowIdx;
        row[meta.RENDER_IDX] = 0;
        row[meta.DEPTH] = 0;
        row[meta.COUNT] = 0;
        row[meta.KEY] = row[0]; // assume keyfieldis 0 for now
        return [row, grpIdx, rowIdx === -1 ? 0 : rowIdx];
      } else if (depth > 0) {
        do {
          grpIdx += 1;
        } while (
          grpIdx < groups.length &&
          getCount(groups[grpIdx], NAV_COUNT) === 0
        );
        if (grpIdx >= groups.length) {
          return NO_RESULT;
        } else {
          return [groups[grpIdx], grpIdx, -1];
        }
      } else {
        const absDepth = Math.abs(depth);
        do {
          grpIdx += 1;
        } while (
          grpIdx < groups.length &&
          (Math.abs(groups[grpIdx][meta.DEPTH] as number) < absDepth ||
            getCount(groups[grpIdx], NAV_COUNT) === 0)
        );
        if (grpIdx >= groups.length) {
          return NO_RESULT;
        } else {
          return [groups[grpIdx], grpIdx, -1];
        }
      }
    }
  };

  previous: IterateMethod = (
    groups,
    rows,
    grpIdx,
    rowIdx,
    navSet,
    NAV_IDX,
    NAV_COUNT,
    meta
  ): IterTuple => {
    if (
      grpIdx !== null &&
      groups[grpIdx][meta.DEPTH] === 1 &&
      typeof rowIdx === "number"
    ) {
      let lastGroup = groups[grpIdx];
      if (rowIdx === 0) {
        return [lastGroup, grpIdx, -1];
      } else {
        rowIdx -= 1;
        const absRowIdx = getAbsRowIdx(lastGroup, rowIdx, navSet, NAV_IDX);
        const row = this.#data[absRowIdx].slice();
        // row[meta.IDX] = idx;
        row[meta.RENDER_IDX] = 0; // is this right ?
        row[meta.DEPTH] = 0;
        row[meta.COUNT] = 0;
        row[meta.KEY] = row[0]; // assume keyfieldis 0 for now

        return [row, grpIdx, rowIdx];
      }
    } else {
      if (grpIdx === null) {
        grpIdx = groups.length - 1;
      } else if (grpIdx === 0) {
        return NO_RESULT;
      } else {
        grpIdx -= 1;
      }
      let lastGroup = groups[grpIdx];
      if (lastGroup[meta.DEPTH] === 1) {
        rowIdx = getCount(lastGroup, NAV_COUNT) - 1;
        const absRowIdx = getAbsRowIdx(lastGroup, rowIdx, navSet, NAV_IDX);
        const row = this.#data[absRowIdx].slice();
        row[meta.RENDER_IDX] = 0; // is tis right ?
        row[meta.DEPTH] = 0;
        row[meta.COUNT] = 0;
        row[meta.KEY] = row[0]; // assume keyfieldis 0 for now

        return [row, grpIdx, rowIdx];
      }
      while (
        lastGroup[meta.PARENT_IDX] !== null &&
        (groups[lastGroup[meta.PARENT_IDX] as number][meta.DEPTH] as number) < 0
      ) {
        grpIdx = lastGroup[meta.PARENT_IDX] as number;
        lastGroup = groups[grpIdx];
      }
      return [lastGroup, grpIdx, -1];
    }
  };

  private skip(n: number, next: IterateMethod) {
    let i = 0;
    let row;

    do {
      [row, this.#grpIdx, this.#rowIdx] = next(
        this.#groupRows,
        this.#data,
        this.#grpIdx,
        this.#rowIdx,
        this.#navSet,
        this.#navIdx,
        this.#navCount,
        this.#meta
      );
      if (next === next) {
        this.#idx += 1;
      } else {
        this.#idx -= 1;
      }
      i += 1;
    } while (row && i < n);
    if (next === this.next) {
      this.#rangePositionLo = [this.#idx - 1, this.#grpIdx, this.#rowIdx];
    } else {
      this.#rangePositionHi = [this.#idx, this.#grpIdx, this.#rowIdx];
    }
  }
}

function getAbsRowIdx(
  group: VuuDataRow,
  relRowIdx: number,
  navSet: number[],
  NAV_IDX: number
) {
  const navIdx = group[NAV_IDX] as number;
  return navSet[navIdx + relRowIdx];
}

/*
  function getRangeIndexOfGroup(grpIdx) {
    const list = _range_positions;
    for (let i = 0; i < list.length; i += RANGE_POS_TUPLE_SIZE) {
      if (list[i + 1] === grpIdx) {
        if (list[i + 2] === null) {
          return i / RANGE_POS_TUPLE_SIZE;
        } else {
          // first row encountere should be the group, if it
          // isn't it means it is crolled out of viewport
          return -1;
        }
      }
    }
    return -1;
  }

  function getRangeIndexOfRow(idx) {
    const list = _range_positions;
    for (let i = 0; i < list.length; i += RANGE_POS_TUPLE_SIZE) {
      if (list[i + 3] === idx) {
        return i / RANGE_POS_TUPLE_SIZE;
      }
    }
    return -1;
  }


  function setNavSet([newNavSet, navIdx, navCount]) {
    navSet = newNavSet;
    NAV_IDX = navIdx;
    NAV_COUNT = navCount;
  }






*/
