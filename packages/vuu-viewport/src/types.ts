import type { RowSource, VuuDataRow } from "@heswell/vuu-table";
import type {
  VuuAggregation,
  VuuFilter,
  VuuRange,
  VuuRowDataItemType,
  VuuSort,
} from "@vuu-ui/vuu-protocol-types";

export type RowPredicate = (row: VuuDataRow) => boolean;

export interface ViewportConfig {
  columns: string[];
  sort: VuuSort;
  filterSpec: VuuFilter;
  groupBy: string[];
  aggregations: VuuAggregation[];
}

export interface ViewportOptions extends Partial<ViewportConfig> {
  id: string;
  range?: VuuRange;
  permissionFilter?: RowPredicate;
  /**
   * A Vuu filter applied in addition to (not replaced by) the client
   * filterSpec, e.g. a freeze filter or a host-imposed restriction.
   */
  baseFilterSpec?: VuuFilter;
  /**
   * Invoked (at most once between flushes) when table changes have been
   * received that may affect the client. The host should schedule a call
   * to flush(). Hosts are free to choose the batching strategy (microtask,
   * timer, explicit tick).
   */
  onPendingChanges?: () => void;
}

export interface ViewportRow {
  rowIndex: number;
  rowKey: string;
  sel: 0 | 1;
  /**
   * Last update time of the underlying table row, taken from the
   * `vuuUpdatedTimestamp` column (epoch millis) if the table has one, else 0.
   * Always 0 for group rows. Not the time the update was published.
   */
  ts: number;
  /**
   * Projected column values. For grouped viewports, data is prefixed by the
   * six tree columns [depth, isExpanded, treeKey, isLeaf, label, childCount].
   */
  data: VuuRowDataItemType[];
}

/**
 * Changes to be communicated to a client. `rows` only ever includes rows
 * within the current range that have changed since last sent.
 */
export interface ViewportBatch {
  size: number;
  sizeChanged: boolean;
  rows: ViewportRow[];
}

export interface LinkFilter {
  column: string;
  values: ReadonlySet<VuuRowDataItemType>;
}

/**
 * The analytics engine behind a single viewport. Implementations must be
 * runtime agnostic - no dependency on browser or server apis.
 */
export interface ViewportEngine {
  readonly id: string;
  readonly config: Readonly<ViewportConfig>;
  readonly range: VuuRange;
  readonly size: number;
  /**
   * Keys (tree keys when grouped) of selected rows in the viewport. Built on
   * demand, O(size), while select-all is active.
   */
  readonly selectedKeys: ReadonlySet<string>;
  readonly selectedRowCount: number;
  /** true between selectAll() and the next non-additive selection change */
  readonly isSelectAll: boolean;
  readonly table: RowSource;

  /** Apply any pending table changes, return changes to send to client. */
  flush(): ViewportBatch;
  /** Full contents of current range, irrespective of what was already sent. */
  getCurrentRange(): ViewportBatch;
  setRange(range: VuuRange): ViewportBatch;
  setConfig(config: Partial<ViewportConfig>): ViewportBatch;
  setPermissionFilter(predicate: RowPredicate | undefined): ViewportBatch;
  setLinkFilter(linkFilter: LinkFilter | undefined): ViewportBatch;
  /**
   * Set the base filter. Composed (AND) with the permission, link and client
   * filters: permission, link, base, client. Undefined or "" clears it.
   */
  setBaseFilter(filterSpec: VuuFilter | undefined): ViewportBatch;
  readonly baseFilterSpec: VuuFilter;

  openTreeNode(treeKey: string): ViewportBatch;
  closeTreeNode(treeKey: string): ViewportBatch;

  selectRow(rowKey: string, preserveExistingSelection: boolean): ViewportBatch;
  deselectRow(
    rowKey: string,
    preserveExistingSelection: boolean,
  ): ViewportBatch;
  selectRowRange(
    fromRowKey: string,
    toRowKey: string,
    preserveExistingSelection: boolean,
  ): ViewportBatch;
  /**
   * Select every row, including rows that enter the viewport later, until
   * a selection change that does not preserve the existing selection.
   */
  selectAll(): ViewportBatch;
  deselectAll(): ViewportBatch;
  /** distinct values of column across the (source table) rows of selected rows */
  getSelectedValues(column: string): Set<VuuRowDataItemType>;
  /** source table keys of selected rows (leaf rows of selected groups) */
  getSelectedRowKeys(): string[];

  /** distinct values of a column within the filtered rows, for typeahead */
  getUniqueValues(
    column: string,
    startsWith?: string,
    limit?: number,
  ): string[];

  /** table row index at position, -1 if position is a group row or empty */
  rowIndexAt(position: number): number;

  destroy(): void;
}

/**
 * Factory for viewport engines. This is the point at which an alternative
 * analytics implementation (e.g. DuckDB) can be plugged in.
 */
export interface DataEngine {
  readonly name: string;
  createViewport(table: RowSource, options: ViewportOptions): ViewportEngine;
}
