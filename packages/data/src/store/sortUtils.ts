import { VuuSortCol } from '@vuu-ui/data-types';
import { ColumnMap } from './columnUtils.js';
import { RowData } from './storeTypes.js';
import { ASC } from './types.js';

type SortCriteria = [number, 'A' | 'D'][];

const EMPTY_MAP = {};

type Row = (string | number | boolean)[];

export type SortItem = [number, ...RowData[]];
export type SortSet = SortItem[];

export const mapSortDefsToSortCriteria = (
  sortDefs: VuuSortCol[],
  columnMap: ColumnMap
): SortCriteria => sortDefs.map(({ column, sortType }) => [columnMap[column], sortType]);

export function sortableFilterSet(filterSet) {
  if (filterSet.length === 0) {
    return filterSet;
  } else if (Array.isArray(filterSet[0])) {
    return filterSet;
  } else {
    return filterSet.map((idx) => [idx, null]);
  }
}

export function sortExtend(
  sortSet: SortSet,
  rows: Row[],
  sortDefs: VuuSortCol[],
  columnMap: ColumnMap
) {
  if (sortDefs.length === 2) {
    sort1ColPlus1(sortSet, rows, sortDefs, columnMap);
  } else if (sortDefs.length === 3) {
    sort2ColsPlus1(sortSet, rows, sortDefs, columnMap);
  }
}

type SortComparator = (item1: SortItem, item2: SortItem) => 0 | -1 | 1;
const sort1A: SortComparator = ([, a1 = 0], [, b1 = 0]) => (a1 > b1 ? 1 : b1 > a1 ? -1 : 0);
const sort1D: SortComparator = ([, a1 = 0], [, b1 = 0]) => (a1 > b1 ? -1 : b1 > a1 ? 1 : 0);
const sort1A2A: SortComparator = ([, a1 = 0, a2 = 0], [, b1 = 0, b2 = 0]) =>
  a1 > b1 ? 1 : b1 > a1 ? -1 : a2 > b2 ? 1 : b2 > a2 ? -1 : 0;
const sort1A2A3A: SortComparator = ([, a1 = 0, a2 = 0, a3 = 0], [, b1 = 0, b2 = 0, b3 = 0]) =>
  a1 > b1 ? 1 : b1 > a1 ? -1 : a2 > b2 ? 1 : b2 > a2 ? -1 : a3 > b3 ? 1 : b3 > a3 ? -1 : 0;

export function sort(sortSet: SortSet, rows: Row[], sortDefs: VuuSortCol[], columnMap: ColumnMap) {
  const sortCriteria = mapSortDefsToSortCriteria(sortDefs, columnMap);
  const count = sortCriteria.length;
  const sortFn = count === 1 ? sort1 : count === 2 ? sort2 : count === 3 ? sort3 : sortAll;
  sortFn(sortSet, rows, sortCriteria);
}

function sort1ColPlus1(
  sortSet: SortSet,
  rows: Row[],
  sortDefs: VuuSortCol[],
  columnMap: ColumnMap
) {
  const len = sortSet.length;
  const sortCriteria = mapSortDefsToSortCriteria(sortDefs, columnMap);
  const [colIdx2] = sortCriteria[1];
  for (let i = 0; i < len; i++) {
    sortSet[i][2] = rows[sortSet[i][0]][colIdx2];
  }
  sortSet.sort(sort1A2A);
}

function sort2ColsPlus1(
  sortSet: SortSet,
  rows: Row[],
  sortDefs: VuuSortCol[],
  columnMap: ColumnMap
) {
  const len = sortSet.length;
  const sortCriteria = mapSortDefsToSortCriteria(sortDefs, columnMap);
  const [colIdx] = sortCriteria[2];
  for (let i = 0; i < len; i++) {
    sortSet[i][3] = rows[sortSet[i][0]][colIdx];
  }
  sortSet.sort(sort1A2A3A);
}

function sort1(sortSet: SortSet, rows: Row[], [[colIdx, direction]]: SortCriteria) {
  const len = sortSet.length;
  for (let i = 0; i < len; i++) {
    const idx = sortSet[i][0];
    sortSet[i][1] = rows[idx][colIdx];
  }
  if (direction === 'A') {
    sortSet.sort(sort1A);
  } else {
    sortSet.sort(sort1D);
  }
}

function sort2(sortSet: SortSet, rows: Row[], sortCriteria: SortCriteria) {
  const len = rows.length;
  const [colIdx1] = sortCriteria[0];
  const [colIdx2] = sortCriteria[1];
  for (let i = 0; i < len; i++) {
    const idx = sortSet[i][0];
    sortSet[i][1] = rows[idx][colIdx1];
    sortSet[i][2] = rows[idx][colIdx2];
  }
  sortSet.sort(sort1A2A);
}

function sort3(/*sortSet,rows,sortCriteria*/) {
  console.log('sort 3 not yet supported');
}
function sortAll(/*sortSet,rows,sortCriteria*/) {
  console.log('sort all not yet supported');
}

export function binarySearch(items, item, comparator) {
  let l = 0;
  let h = items.length - 1;
  let m;
  let comparison;

  while (l <= h) {
    m = (l + h) >>> 1; /* equivalent to Math.floor((l + h) / 2) but faster */
    comparison = comparator(items[m], item);
    if (comparison < 0) {
      l = m + 1;
    } else if (comparison > 0) {
      h = m - 1;
    } else {
      return m;
    }
  }
  return ~l;
}

export function binaryInsert(rows: Row[], row: Row[], comparator) {
  var i = binarySearch(rows, row, comparator);
  /* if the binarySearch return value was zero or positive, a matching object was found */
  /* if the return value was negative, the bitwise complement of the return value is the correct index for this object */
  if (i < 0) {
    i = ~i;
  }
  rows.splice(i, 0, row);
  return i;
}

function processTail(tail, row, tailGateKeeper, n, compare) {
  const diff = tailGateKeeper === null ? -1 : compare(row, tailGateKeeper);

  if (diff > 0 || tail.length < n) {
    binaryInsert(tail, row, compare);
    if (tail.length > n) {
      tail.shift();
    }
    tailGateKeeper = tail[0];
  }
  return tailGateKeeper;
}

// this is always called with a single col sort
export function sortedLowestAndHighest(rows: Row[], sortCriteria, offset, n = 1000) {
  const s1 = new Date().getTime();
  const compare = sortBy(sortCriteria);
  const head = rows.slice(0, n).sort(compare);
  const tail = [];
  const len = rows.length;

  let headGateKeeper = head[n - 1];
  let tailGateKeeper = null;

  for (let i = n; i < len; i++) {
    if (compare(rows[i], headGateKeeper) < 0) {
      binaryInsert(head, rows[i], compare);
      // We need to remove largest item from head, does it belong in tail ?
      tailGateKeeper = processTail(tail, head.pop(), tailGateKeeper, n, compare);
      headGateKeeper = head[n - 1];
    } else {
      tailGateKeeper = processTail(tail, rows[i], tailGateKeeper, n, compare);
    }
  }

  for (let i = 0; i < head.length; i++) {
    const row = head[i].slice();
    row[0] = i + offset;
    head[i] = row;
  }

  for (let i = 0, idx = len - n; i < tail.length; i++, idx++) {
    const row = tail[i].slice();
    row[0] = idx + offset;
    tail[i] = row;
  }

  const s2 = new Date().getTime();
  console.log(`lowest ${n} took ${s2 - s1} ms , producing ${head.length} lowest `);

  return [head, tail];
}

const isSameSortDef = (sortDef1: VuuSortCol, sortDef2: VuuSortCol) =>
  sortDef1.column === sortDef2.column && sortDef1.sortType === sortDef2.sortType;

export function sortExtendsExistingSort(oldSortDefs: VuuSortCol[], newSortDefs: VuuSortCol[]) {
  return (
    newSortDefs.length - oldSortDefs.length === 1 &&
    oldSortDefs.every((sortDef, i) => isSameSortDef(sortDef, newSortDefs[i]))
  );
}

// TODO we need to capture SortAdded, SortRemoved, SortReversed, SortExtended
export const sortHasChanged = (oldSortDefs: VuuSortCol[], newSortDefs: VuuSortCol[]) => {
  if (oldSortDefs.length !== newSortDefs.length) {
    return true;
  } else if (oldSortDefs.length === 0) {
    return false;
  } else {
    return oldSortDefs.some((sortDef: VuuSortCol, i) => !isSameSortDef(sortDef, newSortDefs[i]));
  }
};

export function sortReversed(
  cols1?: VuuSortCol[],
  cols2?: VuuSortCol[],
  colCount = cols1?.length ?? 0
) {
  if (cols1 && cols2 && cols1.length > 0 && cols2.length === colCount) {
    for (let i = 0; i < cols1.length; i++) {
      let { column: col1, sortType: direction1 } = cols1[i];
      let { column: col2, sortType: direction2 } = cols2[i];
      if (col1 !== col2 || direction1 === direction2) {
        return false;
      }
    }
    return true;
  } else {
    return false;
  }
}

export function GROUP_ROW_TEST(group, row, [colIdx, direction]) {
  if (group === row) {
    return 0;
  } else {
    let a1 = direction === 'dsc' ? row[colIdx] : group[colIdx];
    let b1 = direction === 'dsc' ? group[colIdx] : row[colIdx];
    if (b1 === null || a1 > b1) {
      return 1;
    } else if (a1 == null || a1 < b1) {
      return -1;
    }
  }
}

function ROW_SORT_TEST(a, b, [colIdx, direction]) {
  if (a === b) {
    return 0;
  } else {
    let a1 = direction === 'dsc' ? b[colIdx] : a[colIdx];
    let b1 = direction === 'dsc' ? a[colIdx] : b[colIdx];
    if (b1 === null || a1 > b1) {
      return 1;
    } else if (a1 == null || a1 < b1) {
      return -1;
    }
  }
}

// sort null as low. not high
export function sortBy(cols, test = ROW_SORT_TEST) {
  return function (a, b) {
    for (let i = 0, result = 0, len = cols.length; i < len; i++) {
      if ((result = test(a, b, cols[i]))) {
        return result;
      }
    }
    return 0;
  };
}

// sorter is the sort comparator used to sort rows, we want to know
// where row would be positioned in this sorted array. Return the
// last valid position.
export function sortPosition(
  rows: Row[],
  sorter,
  row: Row,
  positionWithinRange = 'last-available'
) {
  function selectFromRange(pos) {
    const len = rows.length;
    const matches = (p) => sorter(rows[p], row) === 0;

    //TODO this will depend on the sort direction
    if (positionWithinRange === 'last-available') {
      while (pos < len && matches(pos)) {
        pos += 1;
      }
    } else if (positionWithinRange === 'first-available') {
      while (pos > 0 && matches(pos - 1)) {
        pos -= 1;
      }
    }

    return pos;
  }

  function find(lo: number, hi: number): number {
    let mid = lo + Math.floor((hi - lo) / 2);
    let pos = sorter(rows[mid], row);

    if (lo === mid) {
      return selectFromRange(pos >= 0 ? lo : hi);
    }
    if (pos >= 0) {
      hi = mid;
    } else {
      lo = mid;
    }
    return find(lo, hi);
  }

  if (rows.length === 0) {
    return 0;
  } else {
    return find(0, rows.length);
  }
}
