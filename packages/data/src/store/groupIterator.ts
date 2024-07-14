import { getCount } from './groupUtils.js';
import {
  compareRanges,
  getDeltaRange,
  getFullRange,
  NULL_RANGE,
  RangeFlags
} from './rangeUtils.js';

const RANGE_POS_TUPLE_SIZE = 4;
const NO_RESULT = [null, null, null];

export const FORWARDS = 0;
export const BACKWARDS = 1;
export default function GroupIterator(groups, navSet, data, NAV_IDX, NAV_COUNT, meta) {
  let _idx = 0;
  let _grpIdx = null;
  let _rowIdx = null;
  let _direction = FORWARDS;
  let _range = NULL_RANGE;
  let _range_position_lo = [0, null, null];
  let _range_positions = [];
  let _range_position_hi = [null, null, null];

  return {
    get direction() {
      return _direction;
    },
    get rangePositions() {
      return _range_positions;
    },
    setRange,
    currentRange,
    getRangeIndexOfGroup,
    getRangeIndexOfRow,
    setNavSet,
    refresh: currentRange,
    clear
  };

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

  function clear() {
    _idx = 0;
    _grpIdx = null;
    _rowIdx = null;
    _direction = FORWARDS;
    _range = NULL_RANGE;
    _range_position_lo = [0, null, null];
    _range_positions = [];
    _range_position_hi = [null, null, null];
  }

  function setNavSet([newNavSet, navIdx, navCount]) {
    navSet = newNavSet;
    NAV_IDX = navIdx;
    NAV_COUNT = navCount;
  }

  function currentRange() {
    const rows = [];
    const { IDX } = meta;
    [_idx, _grpIdx, _rowIdx] = _range_position_lo;
    if (_idx === 0 && _grpIdx === null && _rowIdx === null) {
      _idx = -1;
    }
    _range_positions.length = 0;

    let startIdx = _idx;
    let row;
    let i = _range.lo;
    do {
      _direction = FORWARDS;
      [row, _grpIdx, _rowIdx] = next(
        groups,
        data,
        _grpIdx,
        _rowIdx,
        navSet,
        NAV_IDX,
        NAV_COUNT,
        meta
      );
      if (row) {
        rows.push(row);
        _idx += 1;
        const absRowIdx = _rowIdx === null ? null : row[IDX];
        _range_positions.push(_idx, _grpIdx, _rowIdx, absRowIdx);
        i += 1;
      }
    } while (row && i < _range.hi);
    if (row) {
      _direction = FORWARDS;
      const [grpIdx, rowIdx] = [_grpIdx, _rowIdx];
      [row, _grpIdx, _rowIdx] = next(
        groups,
        data,
        _grpIdx,
        _rowIdx,
        navSet,
        NAV_IDX,
        NAV_COUNT,
        meta
      );
      _idx += 1;
      _range_position_hi = [row ? _idx : null, _grpIdx, _rowIdx];
      [_grpIdx, _rowIdx] = [grpIdx, rowIdx];
    } else {
      _range_position_hi = [null, null, null];
    }

    return [rows, startIdx + 1];
  }

  function setRange(range, useDelta = true) {
    const rangeDiff = compareRanges(_range, range);
    const { lo: resultLo, hi: resultHi } = useDelta
      ? getDeltaRange(_range, range)
      : getFullRange(range);
    const { IDX } = meta;

    if (rangeDiff === RangeFlags.NULL) {
      _range_position_lo = [0, null, null];
      _range_position_hi = [null, null, null];
      _range_positions.length = 0;
      return [[], null];
    } else if (range.lo === _range.lo && useDelta === false) {
      // when we're asked for the same range again, rebuild the range
      [_idx, _grpIdx, _rowIdx] = _range_position_lo;
      _range_positions.length = 0;
    } else {
      if (_direction === FORWARDS && rangeDiff & RangeFlags.BWD) {
        [_idx, _grpIdx, _rowIdx] = _range_positions;
      } else if (_direction === BACKWARDS && rangeDiff & RangeFlags.FWD) {
        [_idx, _grpIdx, _rowIdx] = _range_positions.slice(-RANGE_POS_TUPLE_SIZE);
        _idx += 1;
      }

      if (rangeDiff === RangeFlags.FWD) {
        skip(range.lo - _range.hi, next);
        _range_positions.length = 0;
      } else if (rangeDiff === RangeFlags.BWD) {
        skip(_range.lo - range.hi, previous);
        _range_positions.length = 0;
      }

      const loDiff = range.lo - _range.lo;
      const hiDiff = _range.hi - range.hi;
      // allow for a range that overshoots data
      const missingQuota = _range.hi - _range.lo - _range_positions.length / RANGE_POS_TUPLE_SIZE;

      if (loDiff > 0) {
        const removed = _range_positions.splice(0, loDiff * RANGE_POS_TUPLE_SIZE);
        if (removed.length) {
          _range_position_lo = removed.slice(-RANGE_POS_TUPLE_SIZE);

          // experiment - is this A) always correct B) enough
          if (useDelta === false) {
            [_idx, _grpIdx, _rowIdx] = _range_position_lo;
          }
        }
      }
      if (hiDiff > 0) {
        //TODO allow for scenatio where both lo and HI have changed
        if (hiDiff > missingQuota) {
          const absDiff = hiDiff - missingQuota;
          const removed = _range_positions.splice(
            -absDiff * RANGE_POS_TUPLE_SIZE,
            absDiff * RANGE_POS_TUPLE_SIZE
          );
          if (removed.length) {
            _range_position_hi = removed.slice(0, RANGE_POS_TUPLE_SIZE);
          }
        }
      }
    }

    const rows = [];
    let row;
    let startIdx = null;

    if ((rangeDiff & RangeFlags.REDUCE) === 0) {
      if (rangeDiff & RangeFlags.FWD || rangeDiff === RangeFlags.SAME) {
        let i = resultLo;
        startIdx = _idx;
        do {
          _direction = FORWARDS;
          [row, _grpIdx, _rowIdx] = next(
            groups,
            data,
            _grpIdx,
            _rowIdx,
            navSet,
            NAV_IDX,
            NAV_COUNT,
            meta
          );
          if (row) {
            rows.push(row);
            const absRowIdx = _rowIdx === null ? null : row[IDX];
            _range_positions.push(_idx, _grpIdx, _rowIdx, absRowIdx);
            i += 1;
            _idx += 1;
          }
        } while (row && i < resultHi);
        if (row) {
          _direction = FORWARDS;
          const [grpIdx, rowIdx] = [_grpIdx, _rowIdx];
          [row, _grpIdx, _rowIdx] = next(
            groups,
            data,
            _grpIdx,
            _rowIdx,
            navSet,
            NAV_IDX,
            NAV_COUNT,
            meta
          );
          _range_position_hi = [row ? _idx : null, _grpIdx, _rowIdx];
          [_grpIdx, _rowIdx] = [grpIdx, rowIdx];
        } else {
          _range_position_hi = [null, null, null];
        }
      } else {
        let i = resultHi - 1;
        do {
          _direction = BACKWARDS;
          [row, _grpIdx, _rowIdx] = previous(
            groups,
            data,
            _grpIdx,
            _rowIdx,
            navSet,
            NAV_IDX,
            NAV_COUNT,
            meta
          );
          if (row) {
            _idx -= 1;
            rows.unshift(row);
            const absRowIdx = _rowIdx === null ? null : row[IDX];
            _range_positions.unshift(_idx, _grpIdx, _rowIdx, absRowIdx);
            i -= 1;
          }
        } while (row && i >= resultLo);
        startIdx = _idx;
        if (row) {
          const [grpIdx, rowIdx] = [_grpIdx, _rowIdx];
          _direction = BACKWARDS;
          [row, _grpIdx, _rowIdx] = previous(
            groups,
            data,
            _grpIdx,
            _rowIdx,
            navSet,
            NAV_IDX,
            NAV_COUNT,
            meta
          );
          _range_position_lo = [row ? _idx - 1 : 0, _grpIdx, _rowIdx];
          [_grpIdx, _rowIdx] = [grpIdx, rowIdx];
        } else {
          _range_position_lo = [0, null, null];
        }
      }
    } else {
      // reduced range, adjust the current pos. DIrection can only be a guess, but if it's wrong
      // the appropriate adjustment will be made nest time range is set
      if (rangeDiff & RangeFlags.FWD) {
        console.log(`adjust thye idx`);
        [_idx, _grpIdx, _rowIdx] = _range_positions.slice(-RANGE_POS_TUPLE_SIZE);
        _idx += 1;
      } else {
        [_idx, _grpIdx, _rowIdx] = _range_positions;
      }
    }

    _range = range;
    return [rows, startIdx];
  }

  function skip(n, fn) {
    let i = 0;
    let row;

    do {
      [row, _grpIdx, _rowIdx] = fn(
        groups,
        data,
        _grpIdx,
        _rowIdx,
        navSet,
        NAV_IDX,
        NAV_COUNT,
        meta
      );
      if (fn === next) {
        _idx += 1;
      } else {
        _idx -= 1;
      }
      i += 1;
    } while (row && i < n);
    if (fn === next) {
      _range_position_lo = [_idx - 1, _grpIdx, _rowIdx];
    } else {
      _range_position_hi = [_idx, _grpIdx, _rowIdx];
    }
  }
}

function getAbsRowIdx(group, relRowIdx, navSet, NAV_IDX) {
  return navSet[group[NAV_IDX] + relRowIdx];
}

function next(groups, rows, grpIdx, rowIdx, navSet, NAV_IDX, NAV_COUNT, meta) {
  if (grpIdx === null) {
    grpIdx = -1;
    do {
      grpIdx += 1;
    } while (grpIdx < groups.length && getCount(groups[grpIdx], NAV_COUNT) === 0);

    if (grpIdx >= groups.length) {
      return NO_RESULT;
    } else {
      return [groups[grpIdx], grpIdx, null];
    }
  } else if (grpIdx >= groups.length) {
    return NO_RESULT;
  } else {
    let groupRow = groups[grpIdx];
    const depth = groupRow[meta.DEPTH];
    const count = getCount(groupRow, NAV_COUNT);
    // Note: we're unlikely to be passed the row if row count is zero
    if (depth === 1 && count !== 0 && (rowIdx === null || rowIdx < count - 1)) {
      rowIdx = rowIdx === null ? 0 : rowIdx + 1;
      const absRowIdx = getAbsRowIdx(groupRow, rowIdx, navSet, NAV_IDX);
      // the equivalent of project row
      const row = rows[absRowIdx].slice();
      row[meta.IDX] = absRowIdx;
      row[meta.RENDER_IDX] = 0;
      row[meta.DEPTH] = 0;
      row[meta.COUNT] = 0;
      row[meta.KEY] = row[0]; // assume keyfieldis 0 for now
      return [row, grpIdx, rowIdx === null ? 0 : rowIdx];
    } else if (depth > 0) {
      do {
        grpIdx += 1;
      } while (grpIdx < groups.length && getCount(groups[grpIdx], NAV_COUNT) === 0);
      if (grpIdx >= groups.length) {
        return NO_RESULT;
      } else {
        return [groups[grpIdx], grpIdx, null];
      }
    } else {
      const absDepth = Math.abs(depth);
      do {
        grpIdx += 1;
      } while (
        grpIdx < groups.length &&
        (Math.abs(groups[grpIdx][meta.DEPTH]) < absDepth ||
          getCount(groups[grpIdx], NAV_COUNT) === 0)
      );
      if (grpIdx >= groups.length) {
        return NO_RESULT;
      } else {
        return [groups[grpIdx], grpIdx, null];
      }
    }
  }
}

function previous(groups, data, grpIdx, rowIdx, navSet, NAV_IDX, NAV_COUNT, meta) {
  if (grpIdx !== null && groups[grpIdx][meta.DEPTH] === 1 && typeof rowIdx === 'number') {
    let lastGroup = groups[grpIdx];
    if (rowIdx === 0) {
      return [lastGroup, grpIdx, null];
    } else {
      rowIdx -= 1;
      const absRowIdx = getAbsRowIdx(lastGroup, rowIdx, navSet, NAV_IDX);
      const row = data[absRowIdx].slice();
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
      const row = data[absRowIdx].slice();
      row[meta.RENDER_IDX] = 0; // is tis right ?
      row[meta.DEPTH] = 0;
      row[meta.COUNT] = 0;
      row[meta.KEY] = row[0]; // assume keyfieldis 0 for now

      return [row, grpIdx, rowIdx];
    }
    while (
      lastGroup[meta.PARENT_IDX] !== null &&
      groups[lastGroup[meta.PARENT_IDX]][meta.DEPTH] < 0
    ) {
      grpIdx = lastGroup[meta.PARENT_IDX];
      lastGroup = groups[grpIdx];
    }
    return [lastGroup, grpIdx, null];
  }
}
