import type { RowSource, TableListener, VuuDataRow } from "@heswell/vuu-table";
import type { Filter } from "@vuu-ui/vuu-filter-types";
import type {
  VuuRange,
  VuuRowDataItemType,
  VuuSort,
} from "@vuu-ui/vuu-protocol-types";
import { filterNarrows, parseAndCompileFilter } from "./filter.ts";
import { aggValue, GroupTree, type GroupNode } from "./GroupTree.ts";
import {
  createComparator,
  NO_SORT,
  sortIndex,
  toSortSpec,
  type RowComparator,
  type SortSpec,
} from "./sort.ts";
import type {
  LinkFilter,
  RowPredicate,
  ViewportBatch,
  ViewportConfig,
  ViewportEngine,
  ViewportOptions,
  ViewportRow,
} from "./types.ts";

const EMPTY_SORT: VuuSort = { sortDefs: [] };
const NULL_RANGE: VuuRange = { from: 0, to: 0 };
const TREE_COLUMN_COUNT = 6;

const sameJSON = (o1: unknown, o2: unknown) =>
  JSON.stringify(o1) === JSON.stringify(o2);

const shallowEqual = (a1: unknown[], a2: unknown[]) => {
  if (a1.length !== a2.length) return false;
  for (let i = 0; i < a1.length; i++) {
    if (a1[i] !== a2[i]) return false;
  }
  return true;
};

const growInt32 = (array: Int32Array, minLength: number, fill?: number) => {
  let length = Math.max(16, array.length);
  while (length < minLength) length *= 2;
  const newArray = new Int32Array(length);
  newArray.set(array);
  if (fill !== undefined) newArray.fill(fill, array.length);
  return newArray;
};

interface ColumnBinding {
  /** index in table rows, -1 if not a table column */
  col: number;
  /** groupBy level (0 based) if this is a groupBy column, else -1 */
  groupLevel: number;
  /** aggregation index if this column is aggregated, else -1 */
  aggIndex: number;
  aggType: number;
}

/**
 * In-memory viewport engine.
 *
 * The filtered, sorted row set is held as an Int32Array of table row
 * indices (`index`) plus an inverse map (`posOf`) from row index to
 * position. Row changes are applied as follows:
 *
 * - updates that do not affect sort/filter membership: O(1), the row is
 *   only revisited if it is within the client range.
 * - structural changes (insert, delete, update of a sort column, update that
 *   changes filter membership): the old position is tombstoned in O(1) and
 *   the row queued. On flush, queued rows are sorted and merged into the
 *   index in a single O(n + k log k) pass, however many changes were
 *   batched.
 *
 * Every flush compares the client window with what was previously sent, so
 * only genuinely changed rows are emitted.
 */
export class InMemoryViewport implements ViewportEngine, TableListener {
  readonly id: string;
  readonly table: RowSource;

  #config: ViewportConfig;
  #range: VuuRange;
  #onPendingChanges?: () => void;
  #notified = false;

  // projection
  #bindings: ColumnBinding[] = [];

  // filtering
  #clientFilter: { filter: Filter; predicate: RowPredicate } | undefined;
  #permissionFilter: RowPredicate | undefined;
  #linkFilter: LinkFilter | undefined;
  #predicate: RowPredicate | undefined;

  // sorting
  #sortSpec: SortSpec = NO_SORT;
  #compare: RowComparator;

  // row index
  #index = new Int32Array(0);
  #scratch = new Int32Array(0);
  #indexLen = 0;
  #tombstones = 0;
  #posOf = new Int32Array(0);
  #pendingFlag = new Uint8Array(0);
  #pendingList: number[] = [];
  #forceDirty = new Set<number>();

  // grouping
  #tree: GroupTree | undefined;
  #treeDirty = false;
  #flattenDirty = false;

  // selection. In select-all mode every row is selected except the keys in
  // #deselected, so rows that later enter the viewport are selected too.
  #selected = new Set<string>();
  #selectAll = false;
  #deselected = new Set<string>();
  onSelectionChange?: () => void;

  // client window snapshot
  #sentKey: (string | undefined)[] = [];
  #sentRef: unknown[] = [];
  #sentSel: number[] = [];
  #sentSize = -1;

  constructor(
    table: RowSource,
    {
      id,
      columns = [],
      sort = EMPTY_SORT,
      filterSpec = { filter: "" },
      groupBy = [],
      aggregations = [],
      range = NULL_RANGE,
      permissionFilter,
      onPendingChanges,
    }: ViewportOptions,
  ) {
    this.id = id;
    this.table = table;
    this.#config = { columns, sort, filterSpec, groupBy, aggregations };
    this.#range = range;
    this.#onPendingChanges = onPendingChanges;
    this.#permissionFilter = permissionFilter;
    this.#clientFilter = parseAndCompileFilter(
      filterSpec.filter,
      table.columnMap,
    );
    this.#sortSpec = toSortSpec(sort.sortDefs, table.columnMap);
    this.#compare = createComparator(table, this.#sortSpec);
    this.composePredicate();
    if (groupBy.length > 0) {
      this.#tree = new GroupTree(table, groupBy, aggregations);
      this.#treeDirty = true;
    }
    this.bindColumns();
    this.rebuildIndex();
    this.resetSnapshot();
    table.addListener(this);
  }

  destroy() {
    this.table.removeListener(this);
    this.#onPendingChanges = undefined;
    this.onSelectionChange = undefined;
  }

  get config(): Readonly<ViewportConfig> {
    return this.#config;
  }

  get range() {
    return this.#range;
  }

  get size() {
    return this.#tree ? this.#tree.visible.length : this.#indexLen;
  }

  get selectedKeys(): ReadonlySet<string> {
    if (!this.#selectAll) return this.#selected;
    this.applyPending();
    const keys = new Set<string>();
    const deselected = this.#deselected;
    for (let pos = 0; pos < this.size; pos++) {
      const key = this.keyAt(pos);
      if (!deselected.has(key)) keys.add(key);
    }
    return keys;
  }

  get selectedRowCount() {
    if (!this.#selectAll) return this.#selected.size;
    this.applyPending();
    const deselected = this.#deselected;
    if (deselected.size === 0) return this.size;
    if (this.#tree) {
      let count = 0;
      for (let pos = 0; pos < this.size; pos++) {
        if (!deselected.has(this.keyAt(pos))) count += 1;
      }
      return count;
    }
    let count = this.#indexLen;
    for (const key of deselected) {
      if (this.positionOfKey(key) !== -1) count -= 1;
    }
    return count;
  }

  get isSelectAll() {
    return this.#selectAll;
  }

  get isGrouped() {
    return this.#tree !== undefined;
  }

  get hasPendingChanges() {
    return (
      this.#pendingList.length > 0 ||
      this.#tombstones > 0 ||
      this.#treeDirty ||
      this.#flattenDirty
    );
  }

  // ---------------------------------------------------------------------------
  // TableListener
  // ---------------------------------------------------------------------------

  onInsert(rowIdx: number, row: VuuDataRow) {
    this.ensureRowCapacity(rowIdx + 1);
    this.#posOf[rowIdx] = -1;
    const predicate = this.#predicate;
    if (this.#sortSpec.columns.length === 0 && this.#tombstones === 0) {
      // natural order, an insert always has the highest sequence, append
      if (predicate === undefined || predicate(row)) {
        this.ensureIndexCapacity(this.#indexLen + 1);
        this.#posOf[rowIdx] = this.#indexLen;
        this.#index[this.#indexLen++] = rowIdx;
        if (this.#tree) this.#treeDirty = true;
        this.notify();
      }
    } else {
      this.queue(rowIdx);
    }
  }

  onUpdate(rowIdx: number, row: VuuDataRow, previous: VuuDataRow) {
    if (this.#pendingFlag[rowIdx] === 1) {
      return;
    }
    const pos = this.#posOf[rowIdx];
    const inIndex = pos !== -1;
    const inPlace = previous === row;
    const sortCols = this.#sortSpec.columns;

    let sortChanged = false;
    if (inIndex && sortCols.length > 0) {
      if (inPlace) {
        sortChanged = true;
      } else {
        for (let i = 0; i < sortCols.length; i++) {
          if (row[sortCols[i]] !== previous[sortCols[i]]) {
            sortChanged = true;
            break;
          }
        }
      }
    }

    const predicate = this.#predicate;
    const passes = predicate === undefined || predicate(row);

    if (sortChanged || passes !== inIndex) {
      if (inIndex) this.tombstone(pos);
      if (passes) this.queue(rowIdx);
      else this.notify();
      return;
    }

    if (!inIndex) {
      return;
    }

    const tree = this.#tree;
    if (tree) {
      if (!this.#treeDirty) {
        if (inPlace) {
          this.#treeDirty = true;
        } else {
          const { groupCols } = tree;
          for (let i = 0; i < groupCols.length; i++) {
            if (row[groupCols[i]] !== previous[groupCols[i]]) {
              this.#treeDirty = true;
              break;
            }
          }
          if (
            !this.#treeDirty &&
            tree.hasAggregates &&
            !tree.updateAggregates(rowIdx, previous, row)
          ) {
            this.#treeDirty = true;
          }
        }
      }
      if (inPlace) this.#forceDirty.add(rowIdx);
      this.notify();
    } else if (pos >= this.#range.from && pos < this.#range.to) {
      if (inPlace) this.#forceDirty.add(rowIdx);
      this.notify();
    }
  }

  onDelete(rowIdx: number, row: VuuDataRow, movedFromIdx: number) {
    const posOf = this.#posOf;
    const pendingFlag = this.#pendingFlag;
    const pos = posOf[rowIdx];
    if (pos !== -1) {
      this.tombstone(pos);
    }
    pendingFlag[rowIdx] = 0;
    this.#forceDirty.delete(rowIdx);

    if (movedFromIdx !== -1) {
      const movedPos = posOf[movedFromIdx];
      posOf[rowIdx] = movedPos;
      if (movedPos !== -1) {
        this.#index[movedPos] = rowIdx;
      }
      posOf[movedFromIdx] = -1;
      if (pendingFlag[movedFromIdx] === 1) {
        pendingFlag[movedFromIdx] = 0;
        pendingFlag[rowIdx] = 1;
        this.#pendingList.push(rowIdx);
      }
      if (this.#forceDirty.delete(movedFromIdx)) {
        this.#forceDirty.add(rowIdx);
      }
    }

    const key = String(row[this.table.indexOfKeyField]);
    if (this.#selectAll) {
      // a later insert with the same key must be selected
      if (!this.#deselected.delete(key) && pos !== -1) {
        this.onSelectionChange?.();
      }
    } else if (this.#selected.delete(key)) {
      this.onSelectionChange?.();
    }
    if (pos !== -1) {
      this.notify();
    }
  }

  onClear() {
    this.#indexLen = 0;
    this.#tombstones = 0;
    this.#posOf.fill(-1);
    this.#pendingFlag.fill(0);
    this.#pendingList.length = 0;
    this.#forceDirty.clear();
    if (this.#tree) this.#treeDirty = true;
    this.#deselected.clear();
    if (this.#selected.size > 0 || this.#selectAll) {
      this.#selected.clear();
      this.onSelectionChange?.();
    }
    this.notify();
  }

  // ---------------------------------------------------------------------------
  // public api
  // ---------------------------------------------------------------------------

  flush(): ViewportBatch {
    this.applyPending();
    return this.collect();
  }

  getCurrentRange(): ViewportBatch {
    this.applyPending();
    this.resetSnapshot();
    return this.collect(true);
  }

  setRange(range: VuuRange): ViewportBatch {
    this.applyPending();
    const { from, to } = this.#range;
    if (range.from !== from || range.to !== to) {
      const len = Math.max(0, range.to - range.from);
      const sentKey = new Array<string | undefined>(len);
      const sentRef = new Array<unknown>(len);
      const sentSel = new Array<number>(len).fill(-1);
      const overlapFrom = Math.max(from, range.from);
      const overlapTo = Math.min(to, range.to);
      for (let pos = overlapFrom; pos < overlapTo; pos++) {
        sentKey[pos - range.from] = this.#sentKey[pos - from];
        sentRef[pos - range.from] = this.#sentRef[pos - from];
        sentSel[pos - range.from] = this.#sentSel[pos - from];
      }
      this.#sentKey = sentKey;
      this.#sentRef = sentRef;
      this.#sentSel = sentSel;
      this.#range = { from: range.from, to: range.to };
    }
    return this.collect();
  }

  setConfig(config: Partial<ViewportConfig>): ViewportBatch {
    this.applyPending();
    const current = this.#config;
    const next: ViewportConfig = { ...current };
    for (const key in config) {
      const value = config[key as keyof ViewportConfig];
      if (value !== undefined) {
        (next as unknown as Record<string, unknown>)[key] = value;
      }
    }
    const { columnMap } = this.table;

    const columnsChanged = !sameJSON(current.columns, next.columns);
    const filterChanged = current.filterSpec.filter !== next.filterSpec.filter;
    const sortChanged = !sameJSON(current.sort, next.sort);
    const groupByChanged = !sameJSON(current.groupBy, next.groupBy);
    const aggregationsChanged = !sameJSON(
      current.aggregations,
      next.aggregations,
    );

    this.#config = next;

    if (sortChanged) {
      this.#sortSpec = toSortSpec(next.sort.sortDefs, columnMap);
      this.#compare = createComparator(this.table, this.#sortSpec);
    }

    if (filterChanged) {
      const previousFilter = this.#clientFilter?.filter;
      this.#clientFilter = parseAndCompileFilter(
        next.filterSpec.filter,
        columnMap,
      );
      this.composePredicate();
      if (
        !sortChanged &&
        filterNarrows(this.#clientFilter?.filter, previousFilter)
      ) {
        this.narrowIndex();
      } else {
        this.rebuildIndex();
      }
    } else if (sortChanged) {
      this.resortIndex();
    }

    if (groupByChanged || aggregationsChanged) {
      if (next.groupBy.length === 0) {
        this.#tree = undefined;
      } else {
        const expanded = groupByChanged
          ? new Set<string>()
          : this.#tree?.expanded;
        this.#tree = new GroupTree(
          this.table,
          next.groupBy,
          next.aggregations,
          expanded,
        );
        this.#treeDirty = true;
      }
    } else if (this.#tree && (sortChanged || filterChanged)) {
      this.#treeDirty = true;
    }

    if (columnsChanged || groupByChanged || aggregationsChanged) {
      this.bindColumns();
    }

    const structural =
      columnsChanged ||
      filterChanged ||
      sortChanged ||
      groupByChanged ||
      aggregationsChanged;

    this.applyPending();
    if (structural) {
      this.resetSnapshot();
    }
    return this.collect();
  }

  setPermissionFilter(predicate: RowPredicate | undefined) {
    this.#permissionFilter = predicate;
    return this.refilter();
  }

  setLinkFilter(linkFilter: LinkFilter | undefined) {
    this.#linkFilter = linkFilter;
    return this.refilter();
  }

  get linkFilter() {
    return this.#linkFilter;
  }

  openTreeNode(treeKey: string) {
    const tree = this.#tree;
    if (tree && !tree.expanded.has(treeKey)) {
      tree.expanded.add(treeKey);
      this.#flattenDirty = true;
    }
    return this.flush();
  }

  closeTreeNode(treeKey: string) {
    const tree = this.#tree;
    if (tree && tree.expanded.has(treeKey)) {
      tree.expanded.delete(treeKey);
      // collapse descendants too
      const prefix = treeKey + "|";
      for (const key of tree.expanded) {
        if (key.startsWith(prefix)) tree.expanded.delete(key);
      }
      this.#flattenDirty = true;
    }
    return this.flush();
  }

  selectRow(rowKey: string, preserveExistingSelection: boolean) {
    this.applyPending();
    if (!preserveExistingSelection) {
      this.clearSelection();
      this.#selected.add(rowKey);
    } else if (this.#selectAll) {
      this.#deselected.delete(rowKey);
    } else {
      this.#selected.add(rowKey);
    }
    this.onSelectionChange?.();
    return this.collect();
  }

  deselectRow(rowKey: string, preserveExistingSelection: boolean) {
    this.applyPending();
    if (!preserveExistingSelection) {
      this.clearSelection();
    } else if (this.#selectAll) {
      this.#deselected.add(rowKey);
    } else {
      this.#selected.delete(rowKey);
    }
    this.onSelectionChange?.();
    return this.collect();
  }

  selectAll() {
    this.applyPending();
    this.clearSelection();
    this.#selectAll = true;
    this.onSelectionChange?.();
    return this.collect();
  }

  deselectAll() {
    return this.deselectRow("", false);
  }

  private clearSelection() {
    this.#selected.clear();
    this.#deselected.clear();
    this.#selectAll = false;
  }

  selectRowRange(
    fromRowKey: string,
    toRowKey: string,
    preserveExistingSelection: boolean,
  ) {
    this.applyPending();
    if (!preserveExistingSelection) this.clearSelection();
    let fromPos = this.positionOfKey(fromRowKey);
    let toPos = this.positionOfKey(toRowKey);
    if (fromPos !== -1 && toPos !== -1) {
      if (fromPos > toPos) [fromPos, toPos] = [toPos, fromPos];
      for (let pos = fromPos; pos <= toPos; pos++) {
        if (this.#selectAll) {
          this.#deselected.delete(this.keyAt(pos));
        } else {
          this.#selected.add(this.keyAt(pos));
        }
      }
    }
    this.onSelectionChange?.();
    return this.collect();
  }

  getSelectedRowKeys(): string[] {
    if (this.#selectAll) return this.selectAllRowKeys();
    const tree = this.#tree;
    if (tree === undefined) {
      const keys: string[] = [];
      for (const key of this.#selected) {
        if (this.table.rowIndexAtKey(key) !== -1) keys.push(key);
      }
      return keys;
    }
    this.applyPending();
    const keys = new Set<string>();
    const { rows, indexOfKeyField } = this.table;
    const addLeaves = (node: GroupNode) => {
      if (node.leaves) {
        for (const rowIdx of node.leaves)
          keys.add(String(rows[rowIdx][indexOfKeyField]));
      } else if (node.children) {
        for (const child of node.children) addLeaves(child);
      }
    };
    for (const treeKey of this.#selected) {
      const node = tree.nodesByKey.get(treeKey);
      if (node) {
        addLeaves(node);
      }
    }
    // selected leaves
    const visible = tree.visible;
    for (let pos = 0; pos < visible.length; pos++) {
      const entry = visible[pos];
      if (typeof entry === "number" && this.#selected.has(this.keyAt(pos))) {
        keys.add(String(rows[entry][indexOfKeyField]));
      }
    }
    return Array.from(keys);
  }

  /**
   * Source table keys of all rows in the viewport, less any deselected. When
   * grouped, a deselected group excludes all of its leaf rows.
   */
  private selectAllRowKeys(): string[] {
    this.applyPending();
    const deselected = this.#deselected;
    const { rows, indexOfKeyField } = this.table;
    const keys: string[] = [];
    const tree = this.#tree;
    if (tree === undefined) {
      const index = this.#index;
      for (let pos = 0; pos < this.#indexLen; pos++) {
        const key = String(rows[index[pos]][indexOfKeyField]);
        if (!deselected.has(key)) keys.push(key);
      }
      return keys;
    }
    const addLeaves = (node: GroupNode) => {
      if (deselected.has(node.key)) return;
      if (node.leaves) {
        for (const rowIdx of node.leaves) {
          const rowKey = String(rows[rowIdx][indexOfKeyField]);
          if (deselected.size === 0 || !deselected.has(`${node.key}|${rowKey}`))
            keys.push(rowKey);
        }
      } else if (node.children) {
        for (const child of node.children) addLeaves(child);
      }
    };
    addLeaves(tree.root);
    return keys;
  }

  getSelectedValues(column: string) {
    const values = new Set<VuuRowDataItemType>();
    const col = this.table.columnMap[column];
    if (col === undefined) return values;
    for (const key of this.getSelectedRowKeys()) {
      const rowIdx = this.table.rowIndexAtKey(key);
      if (rowIdx !== -1) values.add(this.table.rows[rowIdx][col]);
    }
    return values;
  }

  getUniqueValues(column: string, startsWith?: string, limit = 10) {
    this.applyPending();
    const col = this.table.columnMap[column];
    if (col === undefined) return [];
    const { rows } = this.table;
    const index = this.#index;
    const pattern = startsWith?.toLowerCase();
    const values = new Set<string>();
    for (let i = 0; i < this.#indexLen; i++) {
      const value = rows[index[i]][col];
      if (value === null || value === undefined) continue;
      const str = String(value);
      if (pattern === undefined || str.toLowerCase().startsWith(pattern)) {
        values.add(str);
      }
    }
    return Array.from(values).sort().slice(0, limit);
  }

  rowIndexAt(position: number) {
    if (this.#tree) {
      const entry = this.#tree.visible[position];
      return typeof entry === "number" ? entry : -1;
    }
    return position < this.#indexLen ? this.#index[position] : -1;
  }

  /** filtered, sorted row indices (flat view of the data, ignoring grouping) */
  get rowIndices(): Int32Array {
    this.applyPending();
    return this.#index.subarray(0, this.#indexLen);
  }

  // ---------------------------------------------------------------------------
  // internals
  // ---------------------------------------------------------------------------

  private notify() {
    if (!this.#notified) {
      this.#notified = true;
      this.#onPendingChanges?.();
    }
  }

  private queue(rowIdx: number) {
    if (this.#pendingFlag[rowIdx] === 0) {
      this.#pendingFlag[rowIdx] = 1;
      this.#pendingList.push(rowIdx);
    }
    this.notify();
  }

  private tombstone(pos: number) {
    this.#posOf[this.#index[pos]] = -1;
    this.#index[pos] = -1;
    this.#tombstones += 1;
  }

  private ensureRowCapacity(n: number) {
    if (this.#posOf.length < n) {
      this.#posOf = growInt32(this.#posOf, n, -1);
      const pendingFlag = new Uint8Array(this.#posOf.length);
      pendingFlag.set(this.#pendingFlag);
      this.#pendingFlag = pendingFlag;
    }
  }

  private ensureIndexCapacity(n: number) {
    if (this.#index.length < n) {
      this.#index = growInt32(this.#index, n);
      this.#scratch = new Int32Array(this.#index.length);
    }
  }

  private composePredicate() {
    const predicates: RowPredicate[] = [];
    if (this.#permissionFilter) predicates.push(this.#permissionFilter);
    if (this.#linkFilter) {
      const col = this.table.columnMap[this.#linkFilter.column];
      const { values } = this.#linkFilter;
      predicates.push(
        col === undefined ? () => false : (row) => values.has(row[col]),
      );
    }
    if (this.#clientFilter) predicates.push(this.#clientFilter.predicate);

    if (predicates.length === 0) {
      this.#predicate = undefined;
    } else if (predicates.length === 1) {
      this.#predicate = predicates[0];
    } else if (predicates.length === 2) {
      const [p1, p2] = predicates;
      this.#predicate = (row) => p1(row) && p2(row);
    } else {
      const [p1, p2, p3] = predicates;
      this.#predicate = (row) => p1(row) && p2(row) && p3(row);
    }
  }

  private refilter() {
    this.applyPending();
    this.composePredicate();
    this.rebuildIndex();
    if (this.#tree) this.#treeDirty = true;
    this.applyPending();
    return this.collect();
  }

  private bindColumns() {
    const { columnMap } = this.table;
    const tree = this.#tree;
    this.#bindings = this.#config.columns.map((name) => {
      const col = columnMap[name] ?? -1;
      let groupLevel = -1;
      let aggIndex = -1;
      let aggType = 0;
      if (tree && col !== -1) {
        groupLevel = tree.groupCols.indexOf(col);
        const aggIndices = tree.aggsByColumn.get(col);
        if (aggIndices) {
          aggIndex = aggIndices[0];
          aggType = tree.aggDefs[aggIndex].type;
        }
      }
      return { col, groupLevel, aggIndex, aggType };
    });
  }

  /** full scan of table, filter then sort */
  private rebuildIndex() {
    const { rows } = this.table;
    const n = rows.length;
    this.ensureRowCapacity(n);
    this.ensureIndexCapacity(n);
    const posOf = this.#posOf;
    const index = this.#index;
    const predicate = this.#predicate;
    posOf.fill(-1);
    this.#pendingFlag.fill(0);
    this.#pendingList.length = 0;
    this.#tombstones = 0;
    this.#forceDirty.clear();

    let len = 0;
    if (predicate === undefined) {
      for (let i = 0; i < n; i++) index[len++] = i;
    } else {
      for (let i = 0; i < n; i++) {
        if (predicate(rows[i])) index[len++] = i;
      }
    }
    this.#indexLen = len;
    this.sortAndMap();
  }

  /** filter current index in place, order is preserved */
  private narrowIndex() {
    this.applyPending();
    const predicate = this.#predicate;
    if (predicate === undefined) return;
    const { rows } = this.table;
    const index = this.#index;
    const posOf = this.#posOf;
    let write = 0;
    for (let read = 0; read < this.#indexLen; read++) {
      const rowIdx = index[read];
      if (predicate(rows[rowIdx])) {
        index[write] = rowIdx;
        posOf[rowIdx] = write++;
      } else {
        posOf[rowIdx] = -1;
      }
    }
    this.#indexLen = write;
  }

  private resortIndex() {
    // pending rows were already merged (with the previous comparator)
    this.sortAndMap();
  }

  private sortAndMap() {
    const index = this.#index;
    const len = this.#indexLen;
    const seq = this.table.seq;
    if (this.#sortSpec.columns.length === 0) {
      let ordered = true;
      for (let i = 1; i < len; i++) {
        if (seq[index[i]] < seq[index[i - 1]]) {
          ordered = false;
          break;
        }
      }
      if (!ordered) sortIndex(index, len, this.table, NO_SORT);
    } else {
      sortIndex(index, len, this.table, this.#sortSpec);
    }
    const posOf = this.#posOf;
    for (let i = 0; i < len; i++) posOf[index[i]] = i;
  }

  /** merge queued rows into the index, compacting tombstones */
  private mergePending() {
    const { rows } = this.table;
    const pendingList = this.#pendingList;
    const pendingFlag = this.#pendingFlag;
    const posOf = this.#posOf;
    const predicate = this.#predicate;
    const rowCount = rows.length;

    let pending: Int32Array | undefined;
    let pendingLen = 0;
    if (pendingList.length > 0) {
      pending = new Int32Array(pendingList.length);
      for (let i = 0; i < pendingList.length; i++) {
        const rowIdx = pendingList[i];
        if (pendingFlag[rowIdx] === 1) {
          pendingFlag[rowIdx] = 0;
          if (
            rowIdx < rowCount &&
            posOf[rowIdx] === -1 &&
            (predicate === undefined || predicate(rows[rowIdx]))
          ) {
            pending[pendingLen++] = rowIdx;
          }
        }
      }
      pendingList.length = 0;
      if (pendingLen > 1) {
        sortIndex(pending, pendingLen, this.table, this.#sortSpec);
      }
    }

    const index = this.#index;
    const indexLen = this.#indexLen;
    const liveLen = indexLen - this.#tombstones;

    if (pendingLen === 0) {
      if (this.#tombstones > 0) {
        let write = 0;
        for (let read = 0; read < indexLen; read++) {
          const rowIdx = index[read];
          if (rowIdx !== -1) {
            index[write] = rowIdx;
            posOf[rowIdx] = write++;
          }
        }
        this.#indexLen = write;
        this.#tombstones = 0;
      }
      return;
    }

    this.ensureIndexCapacity(liveLen + pendingLen);
    const source = this.#index;
    const target = this.#scratch;
    const compare = this.#compare;
    let i = 0;
    let j = 0;
    let k = 0;

    if (pendingLen * Math.log2(liveLen + 2) < liveLen) {
      // Few pending rows relative to index size: compact, then binary search
      // each insertion point and block copy the runs between. Comparator
      // calls are O(k log n) rather than O(n).
      let write = 0;
      if (this.#tombstones > 0) {
        for (let read = 0; read < indexLen; read++) {
          const rowIdx = source[read];
          if (rowIdx !== -1) source[write++] = rowIdx;
        }
      } else {
        write = indexLen;
      }
      const len = write;
      for (j = 0; j < pendingLen; j++) {
        const b = pending![j];
        let lo = i;
        let hi = len;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (compare(source[mid], b) <= 0) lo = mid + 1;
          else hi = mid;
        }
        while (i < lo) {
          const a = source[i++];
          target[k] = a;
          posOf[a] = k++;
        }
        target[k] = b;
        posOf[b] = k++;
      }
      while (i < len) {
        const a = source[i++];
        target[k] = a;
        posOf[a] = k++;
      }
      this.#scratch = source;
      this.#index = target;
      this.#indexLen = k;
      this.#tombstones = 0;
      return;
    }

    while (i < indexLen && j < pendingLen) {
      const a = source[i];
      if (a === -1) {
        i++;
        continue;
      }
      const b = pending![j];
      if (compare(a, b) <= 0) {
        target[k] = a;
        posOf[a] = k++;
        i++;
      } else {
        target[k] = b;
        posOf[b] = k++;
        j++;
      }
    }
    while (i < indexLen) {
      const a = source[i++];
      if (a !== -1) {
        target[k] = a;
        posOf[a] = k++;
      }
    }
    while (j < pendingLen) {
      const b = pending![j++];
      target[k] = b;
      posOf[b] = k++;
    }
    this.#scratch = source;
    this.#index = target;
    this.#indexLen = k;
    this.#tombstones = 0;
  }

  private applyPending() {
    this.#notified = false;
    if (this.#pendingList.length > 0 || this.#tombstones > 0) {
      this.mergePending();
      if (this.#tree) this.#treeDirty = true;
    }
    const tree = this.#tree;
    if (tree) {
      if (this.#treeDirty) {
        tree.build(this.#index, this.#indexLen);
        tree.sortGroups(this.#config.sort.sortDefs);
        tree.flatten();
        this.#treeDirty = false;
        this.#flattenDirty = false;
      } else if (this.#flattenDirty) {
        tree.flatten();
        this.#flattenDirty = false;
      }
    }
  }

  private resetSnapshot() {
    const len = Math.max(0, this.#range.to - this.#range.from);
    this.#sentKey = new Array(len);
    this.#sentRef = new Array(len);
    this.#sentSel = new Array(len).fill(-1);
    this.#sentSize = -1;
  }

  private positionOfKey(key: string) {
    if (this.#tree) {
      const visible = this.#tree.visible;
      for (let pos = 0; pos < visible.length; pos++) {
        if (this.keyAt(pos) === key) return pos;
      }
      return -1;
    }
    const rowIdx = this.table.rowIndexAtKey(key);
    return rowIdx === -1 ? -1 : this.#posOf[rowIdx];
  }

  private keyAt(pos: number): string {
    const { rows, indexOfKeyField } = this.table;
    const tree = this.#tree;
    if (tree) {
      const entry = tree.visible[pos];
      if (typeof entry === "number") {
        const parent = tree.leafParent[entry];
        return `${parent?.key ?? "$root"}|${rows[entry][indexOfKeyField]}`;
      }
      return entry.key;
    }
    return String(rows[this.#index[pos]][indexOfKeyField]);
  }

  private projectRow(row: VuuDataRow) {
    const bindings = this.#bindings;
    const data: (VuuRowDataItemType | null)[] = new Array(bindings.length);
    for (let i = 0; i < bindings.length; i++) {
      const col = bindings[i].col;
      data[i] = col === -1 ? null : row[col];
    }
    return data as VuuRowDataItemType[];
  }

  private groupRowData(node: GroupNode, tree: GroupTree) {
    const bindings = this.#bindings;
    const data: VuuRowDataItemType[] = new Array(
      TREE_COLUMN_COUNT + bindings.length,
    );
    data[0] = node.depth;
    data[1] = tree.expanded.has(node.key);
    data[2] = node.key;
    data[3] = false;
    data[4] = node.label;
    data[5] = node.childCount;
    for (let i = 0; i < bindings.length; i++) {
      const { groupLevel, aggIndex, aggType } = bindings[i];
      let value: VuuRowDataItemType = "";
      if (aggIndex !== -1) {
        value = aggValue(node, aggIndex, aggType) as VuuRowDataItemType;
      } else if (groupLevel !== -1 && groupLevel < node.depth) {
        let n: GroupNode | null = node;
        while (n && n.depth > groupLevel + 1) n = n.parent;
        value = n ? n.label : "";
      }
      data[TREE_COLUMN_COUNT + i] = value;
    }
    return data;
  }

  /**
   * Compare client window with what has previously been sent, emitting rows
   * that have changed.
   */
  private collect(forceSize = false): ViewportBatch {
    const size = this.size;
    const sizeChanged = forceSize || size !== this.#sentSize;
    this.#sentSize = size;

    const { from, to } = this.#range;
    const end = Math.min(to, size);
    const rows: ViewportRow[] = [];
    const tableRows = this.table.rows;
    const keyIdx = this.table.indexOfKeyField;
    const selected = this.#selectAll ? this.#deselected : this.#selected;
    // in select-all mode membership of the set means not selected
    const selIfMember: 0 | 1 = this.#selectAll ? 0 : 1;
    const selIfNotMember: 0 | 1 = this.#selectAll ? 1 : 0;
    const sentKey = this.#sentKey;
    const sentRef = this.#sentRef;
    const sentSel = this.#sentSel;
    const forceDirty = this.#forceDirty;
    const tree = this.#tree;

    for (let pos = from; pos < end; pos++) {
      const slot = pos - from;
      if (tree === undefined) {
        const rowIdx = this.#index[pos];
        const row = tableRows[rowIdx];
        const key = String(row[keyIdx]);
        const sel = selected.has(key) ? selIfMember : selIfNotMember;
        if (
          key !== sentKey[slot] ||
          row !== sentRef[slot] ||
          sel !== sentSel[slot] ||
          forceDirty.has(rowIdx)
        ) {
          sentKey[slot] = key;
          sentRef[slot] = row;
          sentSel[slot] = sel;
          rows.push({
            rowIndex: pos,
            rowKey: key,
            sel,
            data: this.projectRow(row),
          });
        }
      } else {
        const entry = tree.visible[pos];
        if (typeof entry === "number") {
          const row = tableRows[entry];
          const rowKey = String(row[keyIdx]);
          const parent = tree.leafParent[entry];
          const key = `${parent?.key ?? "$root"}|${rowKey}`;
          const sel = selected.has(key) ? selIfMember : selIfNotMember;
          if (
            key !== sentKey[slot] ||
            row !== sentRef[slot] ||
            sel !== sentSel[slot] ||
            forceDirty.has(entry)
          ) {
            sentKey[slot] = key;
            sentRef[slot] = row;
            sentSel[slot] = sel;
            rows.push({
              rowIndex: pos,
              rowKey: key,
              sel,
              data: [
                tree.leafDepth,
                false,
                key,
                true,
                rowKey,
                0,
                ...this.projectRow(row),
              ],
            });
          }
        } else {
          const key = entry.key;
          const sel = selected.has(key) ? selIfMember : selIfNotMember;
          const data = this.groupRowData(entry, tree);
          const previous = sentRef[slot];
          if (
            key !== sentKey[slot] ||
            sel !== sentSel[slot] ||
            !Array.isArray(previous) ||
            !shallowEqual(previous, data)
          ) {
            sentKey[slot] = key;
            sentRef[slot] = data;
            sentSel[slot] = sel;
            rows.push({ rowIndex: pos, rowKey: key, sel, data });
          }
        }
      }
    }
    for (let pos = Math.max(from, end); pos < to; pos++) {
      const slot = pos - from;
      sentKey[slot] = undefined;
      sentRef[slot] = undefined;
      sentSel[slot] = -1;
    }
    forceDirty.clear();
    return { size, sizeChanged, rows };
  }
}

export const inMemoryDataEngine = {
  name: "in-memory",
  createViewport: (table: RowSource, options: ViewportOptions) =>
    new InMemoryViewport(table, options),
};
