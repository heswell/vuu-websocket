import type { RowSource, VuuDataRow } from "@heswell/vuu-table";
import { isSafeBigInt } from "./values.ts";
import type {
  VuuRowDataItemType,
  VuuSortCol,
} from "@vuu-ui/vuu-protocol-types";

export type RowComparator = (rowIdxA: number, rowIdxB: number) => number;

export interface SortSpec {
  /** column indices into table rows */
  columns: number[];
  /** 1 ascending, -1 descending */
  directions: number[];
}

export const NO_SORT: SortSpec = { columns: [], directions: [] };

export function toSortSpec(
  sortDefs: readonly VuuSortCol[],
  columnMap: Record<string, number>,
): SortSpec {
  const columns: number[] = [];
  const directions: number[] = [];
  for (const { column, sortType } of sortDefs) {
    const idx = columnMap[column];
    if (idx !== undefined) {
      columns.push(idx);
      directions.push(sortType === "D" ? -1 : 1);
    }
  }
  return { columns, directions };
}

export const compareValues = (
  v1: VuuRowDataItemType | undefined,
  v2: VuuRowDataItemType | undefined,
) => {
  if (v1 === v2) return 0;
  if (v1 === null || v1 === undefined) return -1;
  if (v2 === null || v2 === undefined) return 1;
  return v1 < v2 ? -1 : v1 > v2 ? 1 : 0;
};

/**
 * Total order over rows: sort columns, then insertion sequence. Because the
 * order is total, every row has exactly one position, which allows binary
 * search and merge based maintenance of a sorted index.
 */
export function createComparator(
  table: RowSource,
  { columns, directions }: SortSpec,
): RowComparator {
  const rows = table.rows as VuuDataRow[];
  const seq = table.seq;
  const len = columns.length;
  if (len === 0) {
    return (a, b) => seq[a] - seq[b];
  }
  if (len === 1) {
    const col = columns[0];
    const dir = directions[0];
    return (a, b) => {
      const v1 = rows[a][col];
      const v2 = rows[b][col];
      if (v1 !== v2) {
        if (v1 === null || v1 === undefined) return -dir;
        if (v2 === null || v2 === undefined) return dir;
        if (v1 < v2) return -dir;
        if (v1 > v2) return dir;
      }
      return seq[a] - seq[b];
    };
  }
  return (a, b) => {
    const rowA = rows[a];
    const rowB = rows[b];
    for (let i = 0; i < len; i++) {
      const col = columns[i];
      const result = compareValues(rowA[col], rowB[col]);
      if (result !== 0) {
        return result * directions[i];
      }
    }
    return seq[a] - seq[b];
  };
}

/**
 * Extract a dense numeric sort key per row for one column. Numbers,
 * booleans and bigints within the safe integer range are used directly
 * (a column may mix number and bigint), strings are rank encoded (distinct values
 * sorted once, then each row gets the rank of its value). null/undefined map
 * to -Infinity, matching compareValues (nulls first). Returns undefined if
 * the column holds a mix of strings and numbers, or a bigint outside the safe
 * integer range, in which case the caller falls back to the generic
 * comparator (which compares bigints exactly).
 */
function extractKeys(
  rows: readonly VuuDataRow[],
  target: Int32Array,
  len: number,
  col: number,
): Float64Array | undefined {
  const keys = new Float64Array(rows.length);
  let strings: Map<string, number> | undefined;
  let numeric = false;
  for (let i = 0; i < len; i++) {
    const rowIdx = target[i];
    const v: unknown = rows[rowIdx][col];
    if (typeof v === "number") {
      if (strings) return undefined;
      numeric = true;
      keys[rowIdx] = v;
    } else if (typeof v === "string") {
      if (numeric) return undefined;
      (strings ??= new Map()).set(v, 0);
    } else if (typeof v === "boolean") {
      if (strings) return undefined;
      numeric = true;
      keys[rowIdx] = v ? 1 : 0;
    } else if (typeof v === "bigint") {
      if (strings || !isSafeBigInt(v)) return undefined;
      numeric = true;
      keys[rowIdx] = Number(v);
    } else if (v === null || v === undefined) {
      keys[rowIdx] = -Infinity;
    } else {
      return undefined;
    }
  }
  if (strings) {
    const distinct = Array.from(strings.keys()).sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    for (let i = 0; i < distinct.length; i++) {
      strings.set(distinct[i], i);
    }
    for (let i = 0; i < len; i++) {
      const rowIdx = target[i];
      const v = rows[rowIdx][col];
      if (typeof v === "string") {
        keys[rowIdx] = strings.get(v) as number;
      }
    }
  }
  return keys;
}

/**
 * Sort the first `len` entries of an index of row positions. Sort columns are
 * first extracted into dense Float64Array keys (strings rank encoded) so the
 * comparator does no row indirection and no string comparison.
 */
export function sortIndex(
  index: Int32Array,
  len: number,
  table: RowSource,
  spec: SortSpec,
) {
  const target = len === index.length ? index : index.subarray(0, len);
  const seq = table.seq;
  const { columns, directions } = spec;
  if (columns.length === 0) {
    target.sort((a, b) => seq[a] - seq[b]);
    return;
  }
  const rows = table.rows as VuuDataRow[];
  const keys: Float64Array[] = [];
  for (const col of columns) {
    const k = extractKeys(rows, target, len, col);
    if (k === undefined) {
      target.sort(createComparator(table, spec));
      return;
    }
    keys.push(k);
  }
  if (keys.length === 1) {
    const k0 = keys[0];
    if (directions[0] === 1) {
      target.sort((a, b) => k0[a] - k0[b] || seq[a] - seq[b]);
    } else {
      target.sort((a, b) => k0[b] - k0[a] || seq[a] - seq[b]);
    }
  } else if (keys.length === 2) {
    const [k0, k1] = keys;
    const [d0, d1] = directions;
    target.sort(
      (a, b) => (k0[a] - k0[b]) * d0 || (k1[a] - k1[b]) * d1 || seq[a] - seq[b],
    );
  } else {
    const n = keys.length;
    target.sort((a, b) => {
      for (let i = 0; i < n; i++) {
        const k = keys[i];
        const diff = k[a] - k[b];
        if (diff !== 0) return diff * directions[i];
      }
      return seq[a] - seq[b];
    });
  }
}

/** binary search for insert position of rowIdx within a sorted index */
export function findInsertPosition(
  index: Int32Array,
  len: number,
  rowIdx: number,
  compare: RowComparator,
) {
  let lo = 0;
  let hi = len;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compare(index[mid], rowIdx) < 0) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}
