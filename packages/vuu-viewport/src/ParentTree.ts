import type { RowSource } from "@heswell/vuu-table";
import type { RowPredicate, VuuTree } from "./types.ts";

/** parentOf value of a root */
const ROOT = -1;
const UNRESOLVED = -2;
const ON_PATH = -3;

const isEmptyParent = (value: unknown) =>
  value === null || value === undefined || value === "";

/**
 * A tree over the rows of a table, built from a column holding the key of
 * each row's parent. Every node is a table row. Built from the rows of the
 * viewport index (all rows within the permission, link and base filters, in
 * sort order), so siblings keep index order.
 *
 * - A row is a root when its parent value is empty, names a key that isn't
 *   in the index, or leads back to the row itself. Every row in such a
 *   cycle is a root.
 * - With a client filter, a row is included when it or any descendant
 *   matches. While filtered, rows show expanded unless collapsed during
 *   that filter; the user's own expanded state applies again when the
 *   filter is cleared.
 * - Rows within openDepth start expanded the first time the tree shows
 *   them.
 */
export class ParentTree {
  readonly parentCol: number;
  readonly openDepth: number;
  /** expanded table keys, the user's own state */
  readonly expanded = new Set<string>();
  /** table keys collapsed while a filter is applied */
  readonly filterCollapsed = new Set<string>();
  readonly #known = new Set<string>();

  /** row index -> child row indices, in index order, unfiltered */
  #children: (number[] | undefined)[] = [];
  #roots: number[] = [];
  /** row index -> 1 when the row is shown under the filter */
  #included: Uint8Array | undefined;
  #member = new Uint8Array(0);

  /** row indices of the visible rows, depth first */
  visible: number[] = [];
  /** parallel to visible */
  visibleDepth: number[] = [];
  visibleExpanded: boolean[] = [];
  visibleChildCount: number[] = [];

  constructor(
    private table: RowSource,
    { parentColumn, openDepth = 0 }: VuuTree,
  ) {
    const col = table.columnMap[parentColumn];
    if (col === undefined) {
      throw Error(`[ParentTree] unknown parent column ${parentColumn}`);
    }
    this.parentCol = col;
    this.openDepth = openDepth;
  }

  get filtered() {
    return this.#included !== undefined;
  }

  /** true when the row is a member of the (filtered) tree */
  includes(rowIdx: number) {
    return (
      this.#member[rowIdx] === 1 &&
      (this.#included === undefined || this.#included[rowIdx] === 1)
    );
  }

  build(index: Int32Array, len: number, match?: RowPredicate) {
    const { rows } = this.table;
    const n = rows.length;
    const parentCol = this.parentCol;

    const member = new Uint8Array(n);
    for (let i = 0; i < len; i++) member[index[i]] = 1;

    const declaredParent = (rowIdx: number) => {
      const value = rows[rowIdx][parentCol];
      if (isEmptyParent(value)) return ROOT;
      const parentIdx = this.table.rowIndexAtKey(String(value));
      return parentIdx !== -1 && member[parentIdx] === 1 ? parentIdx : ROOT;
    };

    const parentOf = new Int32Array(n).fill(UNRESOLVED);
    const path: number[] = [];
    for (let i = 0; i < len; i++) {
      let rowIdx = index[i];
      if (parentOf[rowIdx] !== UNRESOLVED) continue;
      path.length = 0;
      while (rowIdx !== ROOT && parentOf[rowIdx] === UNRESOLVED) {
        parentOf[rowIdx] = ON_PATH;
        path.push(rowIdx);
        rowIdx = declaredParent(rowIdx);
      }
      if (rowIdx !== ROOT && parentOf[rowIdx] === ON_PATH) {
        // the chain came back to a row on this path: those rows form a cycle
        for (let j = path.indexOf(rowIdx); j < path.length; j++) {
          parentOf[path[j]] = ROOT;
        }
      }
      for (const pathIdx of path) {
        if (parentOf[pathIdx] === ON_PATH) {
          parentOf[pathIdx] = declaredParent(pathIdx);
        }
      }
    }

    const children: (number[] | undefined)[] = new Array(n);
    const roots: number[] = [];
    for (let i = 0; i < len; i++) {
      const rowIdx = index[i];
      const parentIdx = parentOf[rowIdx];
      if (parentIdx === ROOT) {
        roots.push(rowIdx);
      } else {
        (children[parentIdx] ??= []).push(rowIdx);
      }
    }

    let included: Uint8Array | undefined;
    if (match) {
      included = new Uint8Array(n);
      for (let i = 0; i < len; i++) {
        const rowIdx = index[i];
        if (match(rows[rowIdx])) {
          for (
            let r = rowIdx;
            r !== ROOT && included[r] === 0;
            r = parentOf[r]
          ) {
            included[r] = 1;
          }
        }
      }
    }

    this.#member = member;
    this.#children = children;
    this.#roots = roots;
    this.#included = included;
    this.retainRows();
  }

  flatten() {
    const visible: number[] = [];
    const visibleDepth: number[] = [];
    const visibleExpanded: boolean[] = [];
    const visibleChildCount: number[] = [];
    const children = this.#children;
    const included = this.#included;

    const visit = (rowIdxs: number[], depth: number) => {
      for (const rowIdx of rowIdxs) {
        if (included !== undefined && included[rowIdx] === 0) continue;
        const childCount = this.childCount(rowIdx);
        const isExpanded =
          childCount > 0 && this.isExpanded(this.keyOf(rowIdx), depth);
        visible.push(rowIdx);
        visibleDepth.push(depth);
        visibleExpanded.push(isExpanded);
        visibleChildCount.push(childCount);
        if (isExpanded) {
          visit(children[rowIdx] as number[], depth + 1);
        }
      }
    };
    visit(this.#roots, 1);

    this.visible = visible;
    this.visibleDepth = visibleDepth;
    this.visibleExpanded = visibleExpanded;
    this.visibleChildCount = visibleChildCount;
  }

  /** Opens a row. Returns true when the state changed. */
  open(key: string) {
    if (this.filtered) {
      return this.filterCollapsed.delete(key);
    }
    if (this.expanded.has(key)) return false;
    this.expanded.add(key);
    return true;
  }

  /**
   * Closes a row and every row below it. Returns true when the state
   * changed.
   */
  close(key: string) {
    const rowIdx = this.table.rowIndexAtKey(key);
    if (rowIdx === -1 || this.#member[rowIdx] !== 1) return false;
    const keys = [key];
    const stack = [...(this.#children[rowIdx] ?? [])];
    while (stack.length > 0) {
      const childIdx = stack.pop() as number;
      keys.push(this.keyOf(childIdx));
      const grandChildren = this.#children[childIdx];
      if (grandChildren) stack.push(...grandChildren);
    }
    let changed = false;
    if (this.filtered) {
      for (const k of keys) {
        if (!this.filterCollapsed.has(k)) {
          this.filterCollapsed.add(k);
          changed = true;
        }
      }
    } else {
      for (const k of keys) {
        if (this.expanded.delete(k)) changed = true;
      }
    }
    return changed;
  }

  /** Called when the client filter changes: collapses made under a filter go. */
  clearFilterState() {
    this.filterCollapsed.clear();
  }

  private isExpanded(key: string, depth: number) {
    if (!this.#known.has(key)) {
      this.#known.add(key);
      if (depth <= this.openDepth) {
        this.expanded.add(key);
      }
    }
    return this.filtered
      ? !this.filterCollapsed.has(key)
      : this.expanded.has(key);
  }

  private childCount(rowIdx: number) {
    const rowChildren = this.#children[rowIdx];
    if (rowChildren === undefined) return 0;
    const included = this.#included;
    if (included === undefined) return rowChildren.length;
    let count = 0;
    for (const childIdx of rowChildren) {
      if (included[childIdx] === 1) count += 1;
    }
    return count;
  }

  private keyOf(rowIdx: number) {
    return String(this.table.rows[rowIdx][this.table.indexOfKeyField]);
  }

  /** drops keys of rows deleted from the table */
  private retainRows() {
    for (const keys of [this.expanded, this.filterCollapsed, this.#known]) {
      for (const key of keys) {
        if (this.table.rowIndexAtKey(key) === -1) {
          keys.delete(key);
        }
      }
    }
  }
}
