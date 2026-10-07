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

export interface ViewportOptions<R = ViewportRow>
  extends Partial<ViewportConfig> {
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
  /**
   * Builds the rows returned in each ViewportBatch, letting a host create
   * rows in its own output format without an intermediate ViewportRow.
   * Defaults to viewportRowWriter.
   */
  rowWriter?: RowWriter<R>;
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
 * Row metadata passed to RowWriter.create. The engine reuses a single
 * instance, so values must be copied out during the call, not retained.
 */
export interface RowHeader {
  rowIndex: number;
  rowKey: string;
  sel: 0 | 1;
  /** see ViewportRow.ts */
  ts: number;
  // tree columns, meaningful only for grouped viewports
  depth: number;
  isExpanded: boolean;
  treeKey: string;
  isLeaf: boolean;
  label: VuuRowDataItemType;
  childCount: number;
}

/**
 * Creates output rows. For each changed row the engine calls create, then
 * writes column values into values(row), starting at dataOffset. Values are
 * already in protocol form (bigint converted).
 */
export interface RowWriter<R> {
  /** index in values(row) at which the first value is written */
  readonly dataOffset: number;
  /**
   * When true, values for grouped viewports are prefixed by the six tree
   * columns [depth, isExpanded, treeKey, isLeaf, label, childCount], as in
   * ViewportRow.data. When false only column values are written; tree
   * columns are available from the header.
   */
  readonly treeColumnsInData: boolean;
  /** valueCount: the number of values the engine will write */
  create(header: Readonly<RowHeader>, valueCount: number): R;
  values(row: R): unknown[];
}

/** The default RowWriter, produces ViewportRow */
export const viewportRowWriter: RowWriter<ViewportRow> = {
  dataOffset: 0,
  treeColumnsInData: true,
  create: ({ rowIndex, rowKey, sel, ts }, valueCount) => ({
    rowIndex,
    rowKey,
    sel,
    ts,
    data: new Array(valueCount),
  }),
  values: (row) => row.data,
};

/**
 * Changes to be communicated to a client. `rows` only ever includes rows
 * within the current range that have changed since last sent.
 */
export interface ViewportBatch<R = ViewportRow> {
  size: number;
  sizeChanged: boolean;
  rows: R[];
}

export interface LinkFilter {
  column: string;
  values: ReadonlySet<VuuRowDataItemType>;
}

/**
 * The analytics engine behind a single viewport. Implementations must be
 * runtime agnostic - no dependency on browser or server apis.
 */
export interface ViewportEngine<R = ViewportRow> {
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
  flush(): ViewportBatch<R>;
  /** Full contents of current range, irrespective of what was already sent. */
  getCurrentRange(): ViewportBatch<R>;
  setRange(range: VuuRange): ViewportBatch<R>;
  setConfig(config: Partial<ViewportConfig>): ViewportBatch<R>;
  setPermissionFilter(predicate: RowPredicate | undefined): ViewportBatch<R>;
  setLinkFilter(linkFilter: LinkFilter | undefined): ViewportBatch<R>;
  /**
   * Set the base filter. Composed (AND) with the permission, link and client
   * filters: permission, link, base, client. Undefined or "" clears it.
   */
  setBaseFilter(filterSpec: VuuFilter | undefined): ViewportBatch<R>;
  readonly baseFilterSpec: VuuFilter;

  openTreeNode(treeKey: string): ViewportBatch<R>;
  closeTreeNode(treeKey: string): ViewportBatch<R>;

  selectRow(rowKey: string, preserveExistingSelection: boolean): ViewportBatch<R>;
  deselectRow(
    rowKey: string,
    preserveExistingSelection: boolean,
  ): ViewportBatch<R>;
  selectRowRange(
    fromRowKey: string,
    toRowKey: string,
    preserveExistingSelection: boolean,
  ): ViewportBatch<R>;
  /**
   * Select every row, including rows that enter the viewport later, until
   * a selection change that does not preserve the existing selection.
   */
  selectAll(): ViewportBatch<R>;
  deselectAll(): ViewportBatch<R>;
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
  createViewport<R = ViewportRow>(
    table: RowSource,
    options: ViewportOptions<R>,
  ): ViewportEngine<R>;
}
