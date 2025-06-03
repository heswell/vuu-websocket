import {
  VuuDataRow,
  VuuRowDataItemType,
  VuuSortCol,
} from "@vuu-ui/vuu-protocol-types";
import { ColumnMap } from "@vuu-ui/vuu-utils";
import { Table } from "./table";

type SortDirection = "A" | "D";
export type SortCriterium = [number, SortDirection];
export type SortCriteria = SortCriterium[];

export const ASC: SortDirection = "A";
export const DSC: SortDirection = "D";

export type SortItem = [number, ...VuuRowDataItemType[]];
export type SortSet = SortItem[];

type SortResult = 1 | 0 | -1;
type SortComparator<T = SortItem> = (a: T, b: T) => SortResult;

export const mapSortDefsToSortCriteria = (
  sortDefs: VuuSortCol[] | undefined,
  columnMap: ColumnMap
): SortCriteria =>
  sortDefs === undefined
    ? []
    : sortDefs.map(({ column, sortType }) => {
        const colIdx = columnMap[column];
        if (colIdx === undefined) {
          throw Error(
            `mapSortDefsToSortCriteria, column ${column} not in Column Map`
          );
        }
        return [colIdx, sortType];
      });

export function sortExtend(
  sortSet: SortSet,
  rows: VuuDataRow[],
  sortDefs: VuuSortCol[],
  columnMap: ColumnMap
) {
  if (sortDefs.length === 2) {
    sort1ColPlus1(sortSet, rows, sortDefs, columnMap);
  } else if (sortDefs.length === 3) {
    sort2ColsPlus1(sortSet, rows, sortDefs, columnMap);
  }
}
const sortIndex: SortComparator = ([a1], [b1]) =>
  a1 > b1 ? 1 : b1 > a1 ? -1 : 0;

const sort1A: SortComparator = ([, a1 = 0], [, b1 = 0]) =>
  a1 > b1 ? 1 : b1 > a1 ? -1 : 0;
const sort1D: SortComparator = ([, a1 = 0], [, b1 = 0]) =>
  a1 > b1 ? -1 : b1 > a1 ? 1 : 0;
const sort1A2A: SortComparator = ([, a1 = 0, a2 = 0], [, b1 = 0, b2 = 0]) =>
  a1 > b1 ? 1 : b1 > a1 ? -1 : a2 > b2 ? 1 : b2 > a2 ? -1 : 0;
const sort1A2A3A: SortComparator = (
  [, a1 = 0, a2 = 0, a3 = 0],
  [, b1 = 0, b2 = 0, b3 = 0]
) =>
  a1 > b1
    ? 1
    : b1 > a1
    ? -1
    : a2 > b2
    ? 1
    : b2 > a2
    ? -1
    : a3 > b3
    ? 1
    : b3 > a3
    ? -1
    : 0;

export const revertToIndexSort = (sortSet: SortSet) => sortSet.sort(sortIndex);

export const getSortFunctionOptimisedForSortCriteria = (
  sortDefs: VuuSortCol[]
) => {
  switch (sortDefs.length) {
    case 0:
      throw Error("no sort criteria");
    case 1:
      return sort1;
    case 2:
      return sort2;
    case 3:
      return sort3;
    default:
      return sortAll;
  }
};

export function sort(
  sortSet: SortSet,
  rows: VuuDataRow[],
  sortDefs: VuuSortCol[],
  columnMap: ColumnMap
) {
  const sortCriteria = mapSortDefsToSortCriteria(sortDefs, columnMap);
  const sortFn = getSortFunctionOptimisedForSortCriteria(sortDefs);
  sortFn(sortSet, rows, sortCriteria);
}

function sort1ColPlus1(
  sortSet: SortSet,
  rows: VuuDataRow[],
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
  rows: VuuDataRow[],
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

function sort1(
  sortSet: SortSet,
  rows: VuuDataRow[],
  [[colIdx, direction]]: SortCriteria
) {
  const len = sortSet.length;
  for (let i = 0; i < len; i++) {
    const idx = sortSet[i][0];
    sortSet[i][1] = rows[idx][colIdx];
  }
  if (direction === "A") {
    sortSet.sort(sort1A);
  } else {
    sortSet.sort(sort1D);
  }
}

function sort2(
  sortSet: SortSet,
  rows: VuuDataRow[],
  sortCriteria: SortCriteria
) {
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
  console.log("sort 3 not yet supported");
}
function sortAll(/*sortSet,rows,sortCriteria*/) {
  console.log("sort all not yet supported");
}

export function binarySearch<T = VuuDataRow>(
  items: T[],
  item: T,
  comparator: SortComparator<T>
) {
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

export function binaryInsert(
  rows: VuuDataRow[],
  row: VuuDataRow,
  comparator: SortComparator<VuuDataRow>
) {
  var i = binarySearch(rows, row, comparator);
  /* if the binarySearch return value was zero or positive, a matching object was found */
  /* if the return value was negative, the bitwise complement of the return value is the correct index for this object */
  if (i < 0) {
    i = ~i;
  }
  rows.splice(i, 0, row);
  return i;
}

function processTail(
  tail: VuuDataRow[],
  row: VuuDataRow,
  tailGateKeeper: VuuDataRow | null,
  n: number,
  compare: SortComparator<VuuDataRow>
) {
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
export function sortedLowestAndHighest(
  rows: VuuDataRow[],
  sortCriteria: SortCriteria,
  n = 1000
) {
  const s1 = new Date().getTime();
  const compare = sortBy(sortCriteria);
  const head = rows.slice(0, n).sort(compare);
  const tail: VuuDataRow[] = [];
  const len = rows.length;

  let headGateKeeper = head[n - 1];
  let tailGateKeeper = null;

  for (let i = n; i < len; i++) {
    if (compare(rows[i], headGateKeeper) < 0) {
      binaryInsert(head, rows[i], compare);
      // We need to remove largest item from head, does it belong in tail ?
      tailGateKeeper = processTail(
        tail,
        head.pop() as VuuDataRow,
        tailGateKeeper,
        n,
        compare
      );
      headGateKeeper = head[n - 1];
    } else {
      tailGateKeeper = processTail(tail, rows[i], tailGateKeeper, n, compare);
    }
  }

  for (let i = 0; i < head.length; i++) {
    const row = head[i].slice();
    row[0] = i;
    head[i] = row;
  }

  for (let i = 0, idx = len - n; i < tail.length; i++, idx++) {
    const row = tail[i].slice();
    row[0] = idx;
    tail[i] = row;
  }

  const s2 = new Date().getTime();
  console.log(
    `lowest ${n} took ${s2 - s1} ms , producing ${head.length} lowest `
  );

  return [head, tail];
}

const isSameSortDef = (sortDef1: VuuSortCol, sortDef2: VuuSortCol) =>
  sortDef1.column === sortDef2.column &&
  sortDef1.sortType === sortDef2.sortType;

export function sortExtendsExistingSort(
  existingSortCols: VuuSortCol[] = [],
  newSortCols: VuuSortCol[]
) {
  return (
    existingSortCols.length > 0 &&
    newSortCols.length - existingSortCols.length === 1 &&
    existingSortCols.every((sortDef, i) =>
      isSameSortDef(sortDef, newSortCols[i])
    )
  );
}

export const sortRemoved = (
  existingSortCols: VuuSortCol[] = [],
  newSortCols: VuuSortCol[]
) => existingSortCols.length > 0 && newSortCols.length === 0;

export function sortReversed(
  existingSortCols: VuuSortCol[] = [],
  newSortCols: VuuSortCol[],
  colCount = existingSortCols.length
) {
  if (existingSortCols.length > 0 && newSortCols.length === colCount) {
    for (let i = 0; i < existingSortCols.length; i++) {
      let { column: col1, sortType: direction1 } = existingSortCols[i];
      let { column: col2, sortType: direction2 } = newSortCols[i];
      if (col1 !== col2 || direction1 === direction2) {
        return false;
      }
    }
    return true;
  } else {
    return false;
  }
}

export const GROUP_ROW_TEST: RowSortTest = (
  groupRow,
  row,
  [colIdx, direction]
) => {
  if (groupRow === row) {
    return 0;
  } else {
    const a1 = direction === "D" ? row[colIdx] : groupRow[colIdx];
    const b1 = direction === "D" ? groupRow[colIdx] : row[colIdx];
    if (b1 === null || a1 > b1) {
      return 1;
    } else if (a1 == null || a1 < b1) {
      return -1;
    } else {
      // can't happen, but keeps typescript happy
      return 0;
    }
  }
};

type RowSortTest = (
  a: VuuDataRow,
  b: VuuDataRow,
  sortCriterium: SortCriterium
) => SortResult;

const ROW_SORT_TEST: RowSortTest = (a, b, [colIdx, direction]) => {
  if (a === b) {
    return 0;
  } else {
    let a1 = direction === "D" ? b[colIdx] : a[colIdx];
    let b1 = direction === "D" ? a[colIdx] : b[colIdx];
    if (b1 === null || a1 > b1) {
      return 1;
    } else if (a1 == null || a1 < b1) {
      return -1;
    } else {
      // can't happen, but keeps typescript happy
      return 0;
    }
  }
};

// sort null as low. not high
export function sortBy<T = VuuDataRow>(
  sortCriteria: SortCriteria,
  test: RowSortTest = ROW_SORT_TEST
): SortComparator<VuuDataRow> {
  return function (a: VuuDataRow, b: VuuDataRow): SortResult {
    for (
      let i = 0, result: SortResult = 0, len = sortCriteria.length;
      i < len;
      i++
    ) {
      if ((result = test(a, b, sortCriteria[i]))) {
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
  rows: VuuDataRow[],
  sortComparator: SortComparator<VuuDataRow>,
  row: VuuDataRow,
  positionWithinRange = "last-available"
) {
  function selectFromRange(pos: number) {
    const len = rows.length;
    const matches = (p: number) => sortComparator(rows[p], row) === 0;

    //TODO this will depend on the sort direction
    if (positionWithinRange === "last-available") {
      while (pos < len && matches(pos)) {
        pos += 1;
      }
    } else if (positionWithinRange === "first-available") {
      while (pos > 0 && matches(pos - 1)) {
        pos -= 1;
      }
    }

    return pos;
  }

  function find(lo: number, hi: number): number {
    let mid = lo + Math.floor((hi - lo) / 2);
    let pos = sortComparator(rows[mid], row);

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

export type SortSetInsertPosition = number | "start" | "end";

export const getSortSetInsertionPosition = (
  sortSet: SortSet,
  sortValue: VuuRowDataItemType
): SortSetInsertPosition => {
  const [, firstSortValue] = sortSet.at(0) as SortItem;
  const [, lastSortValue] = sortSet.at(-1) as SortItem;

  const reverseSort = parseInt(firstSortValue) > parseInt(lastSortValue);

  if (reverseSort && parseInt(sortValue) > parseInt(firstSortValue)) {
    return "start";
  } else if (reverseSort && parseInt(sortValue) < parseInt(lastSortValue)) {
    return "end";
  } else if (!reverseSort && parseInt(sortValue) > parseInt(lastSortValue)) {
    return "end";
  } else if (!reverseSort && parseInt(sortValue) < parseInt(firstSortValue)) {
    return "start";
  }

  return -1;
};
