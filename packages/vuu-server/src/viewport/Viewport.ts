import type {
  VuuFilter,
  VuuGroupBy,
  VuuRange,
  VuuSort,
  VuuViewportChangeRequest,
} from "@vuu-ui/vuu-protocol-types";
import { EventEmitter } from "@vuu-ui/vuu-utils";
import type { Table } from "@heswell/vuu-table";
import {
  inMemoryDataEngine,
  type DataEngine,
  type ViewportBatch,
  type ViewportConfig,
  type ViewportEngine,
  type ViewportRow,
} from "@heswell/vuu-viewport";
import { ViewPortDef } from "../api/ViewPortDef";
import { Column } from "../api/TableDef";
import {
  DataTable,
  isDataTable,
  RowKeyUpdate,
} from "../core/table/InMemDataTable";
import { ClientSessionId } from "../net/ClientConnectionCreator";
import { VuuUser } from "../core/auths/VuuUser";
import { PublishQueue } from "../util/PublishQueue";
import { isSessionDataTable } from "../core/table/InMemSessionDataTable";
import {
  AllowAllPermissionFilter,
  PermissionFilter,
} from "../core/filter/PermissionFilter";

type ViewPortUpdateType = "SIZE" | "ROW";

export interface ViewPortSelection {
  rowKeys: ReadonlySet<string>;
  viewPort: Viewport;
}

export function ViewPortSelection(
  rowKeys: ReadonlySet<string>,
  viewPort: Viewport,
): ViewPortSelection {
  return { rowKeys, viewPort };
}

// TODO this needs some work
export type ViewPortStructuralFields = {
  columns: string[];
  filterSpec: VuuFilter;
  groupBy: VuuGroupBy;
  sort: VuuSort;
};

export type ViewportCreateConfig = Partial<ViewportConfig> & {
  range?: VuuRange;
};

export interface ViewPortUpdate {
  index: number;
  key: RowKeyUpdate;
  vpRequestId: string;
  size: number;
  table: Table | null; // null for SIZE update
  ts: number;
  vp: Viewport;
  vpUpdate: ViewPortUpdateType;
  /** materialized row data, as computed by the viewport engine */
  row?: ViewportRow;
}
export interface ViewPortRowUpdate extends ViewPortUpdate {
  row: ViewportRow;
}

export const isViewPortRowUpdate = (
  vpu: ViewPortUpdate,
): vpu is ViewPortRowUpdate => vpu.vpUpdate === "ROW" && vpu.row !== undefined;

export class ViewPortUpdateImpl implements ViewPortUpdate {
  constructor(
    public vpRequestId: string,
    public vp: Viewport,
    public table: Table | null, // rather than scala RowSource
    public key: RowKeyUpdate,
    public index: number,
    public vpUpdate: ViewPortUpdateType,
    public size: number,
    public ts: number,
    public row?: ViewportRow,
  ) {}
}

export const ViewPortUpdate = (
  vpRequestId: string,
  vp: Viewport,
  table: Table | null,
  key: RowKeyUpdate,
  index: number,
  vpUpdate: ViewPortUpdateType,
  size: number,
  ts: number,
  row?: ViewportRow,
): ViewPortUpdate =>
  new ViewPortUpdateImpl(
    vpRequestId,
    vp,
    table,
    key,
    index,
    vpUpdate,
    size,
    ts,
    row,
  );

export interface ViewPortVisualLink {
  childVp: Viewport;
  parentVp: Viewport;
  childColumn: Column;
  parentColumn: Column;
}

/**
 * Restricts the rows of the child viewport to those where childColumn
 * matches the parentColumn value of any row selected in the parent. With
 * no selection in the parent, the child is unrestricted. The link is
 * applied as a filter independent of the child's own client filter.
 */
export class RuntimeViewPortVisualLink implements ViewPortVisualLink {
  constructor(
    public childVp: Viewport,
    public parentVp: Viewport,
    public childColumn: Column,
    public parentColumn: Column,
  ) {
    parentVp.on("row-selection", this.handleSelectionEvent);
    this.handleSelectionEvent();
  }

  remove() {
    this.parentVp.removeListener("row-selection", this.handleSelectionEvent);
    this.childVp.setLinkFilter(undefined);
  }

  private handleSelectionEvent = () => {
    const values = this.parentVp.getSelectedValues(this.parentColumn.name);
    this.childVp.setLinkFilter(
      values.size === 0 ? undefined : { column: this.childColumn.name, values },
    );
  };
}

export const ViewPortVisualLink = (
  childVp: Viewport,
  parentVp: Viewport,
  childColumn: Column,
  parentColumn: Column,
) =>
  new RuntimeViewPortVisualLink(childVp, parentVp, childColumn, parentColumn);

export interface ViewPortRange {
  contains: (i: number) => boolean;
  from: number;
  subtract: (range: ViewPortRange) => ViewPortRange;
  to: number;
}
class ViewPortRangeImpl implements ViewPortRange {
  constructor(
    public from: number,
    public to: number,
  ) {}

  contains(i: number) {
    return i >= this.from && i < this.to;
  }

  subtract(newRange: ViewPortRange) {
    let from = newRange.from;
    let to = newRange.to;

    if (newRange.from > this.from && newRange.from < this.to) {
      from = this.to;
      to = newRange.to;
    }

    if (
      newRange.from < this.from &&
      newRange.to < this.to &&
      newRange.to > this.from
    ) {
      from = newRange.from;
      to = this.from;
    }

    return ViewPortRange(from, to);
  }
}

export const ViewPortRange = (from: number, to: number): ViewPortRange =>
  new ViewPortRangeImpl(from, to);

// ---------------------------------------------------------------------------
// Flush scheduling. Table changes are queued within each viewport engine,
// dirty viewports are flushed together once the current burst of
// (synchronous) table updates has completed. This coalesces many updates to
// the same row and amortises sort/filter maintenance across the burst.
// ---------------------------------------------------------------------------

const dirtyViewports = new Set<Viewport>();
let flushScheduled = false;

const scheduleFlush =
  typeof setImmediate === "function"
    ? (fn: () => void) => setImmediate(fn)
    : (fn: () => void) => setTimeout(fn, 0);

const markDirty = (viewport: Viewport) => {
  dirtyViewports.add(viewport);
  if (!flushScheduled) {
    flushScheduled = true;
    scheduleFlush(flushViewports);
  }
};

/**
 * Flush all viewports with pending changes. Invoked automatically, exposed
 * for tests and for hosts that want deterministic flushing.
 */
export function flushViewports() {
  flushScheduled = false;
  if (dirtyViewports.size === 0) return;
  const viewports = Array.from(dirtyViewports);
  dirtyViewports.clear();
  for (const viewport of viewports) {
    viewport.flush();
  }
}

let defaultDataEngine: DataEngine = inMemoryDataEngine;

/**
 * Replace the analytics engine used for new viewports, e.g. to evaluate an
 * alternative implementation. Existing viewports are unaffected.
 */
export const setDefaultDataEngine = (engine: DataEngine) => {
  defaultDataEngine = engine;
};

export const getDefaultDataEngine = () => defaultDataEngine;

export type ViewportEvents = {
  "row-selection": () => void;
};

const NO_SIZE = -1;

export class Viewport extends EventEmitter<ViewportEvents> {
  #clientSessionId: ClientSessionId;
  #enabled: boolean = true;
  #engine: ViewportEngine;
  #id: string;
  #outboundQ: PublishQueue<ViewPortUpdate>;
  #permissionFilter: PermissionFilter | undefined;
  #requestId: string = "";
  #table: DataTable;
  #user: VuuUser;
  #viewPortDef: ViewPortDef;
  #viewPortVisualLink?: RuntimeViewPortVisualLink;

  constructor(
    id: string,
    user: VuuUser,
    clientSessionId: ClientSessionId,
    outboundQ: PublishQueue<ViewPortUpdate>,
    _structuralFields: ViewPortStructuralFields,
    range: VuuRange,
    table: DataTable,
    config: ViewportCreateConfig,
    // in scala, this is passed with config as 'structural'
    viewPortDef: ViewPortDef,
    dataEngine: DataEngine = defaultDataEngine,
  ) {
    super();
    this.#id = id;
    this.#user = user;
    this.#clientSessionId = clientSessionId;
    this.#outboundQ = outboundQ;
    this.#viewPortDef = viewPortDef;
    this.#table = table;
    this.#engine = dataEngine.createViewport(table as unknown as Table, {
      id,
      aggregations: config.aggregations,
      columns: this.expandColumns(config.columns),
      filterSpec: config.filterSpec,
      groupBy: config.groupBy,
      sort: config.sort,
      range: config.range ?? range,
      onPendingChanges: () => markDirty(this),
    });
  }

  private expandColumns(columns?: string[]) {
    if (columns && columns.length === 1 && columns[0] === "*") {
      return this.#table.schema.columns.map((c) => c.name);
    }
    return columns;
  }

  get id() {
    return this.#id;
  }

  get engine() {
    return this.#engine;
  }

  get table() {
    return this.#table;
  }

  get columns() {
    return this.#engine.config.columns;
  }

  get config() {
    return this.#engine.config;
  }

  get range() {
    return this.#engine.range;
  }

  get size() {
    return this.#engine.size;
  }

  get enabled() {
    return this.#enabled;
  }

  set enabled(enabled: boolean) {
    const wasEnabled = this.#enabled;
    this.#enabled = enabled;
    if (enabled && !wasEnabled) {
      // changes were not published whilst disabled, resend everything
      this.postDataForCurrentRange();
    }
  }

  get user() {
    return this.#user;
  }

  get permissionFilter() {
    return this.#permissionFilter;
  }

  set permissionFilter(permissionFilter: PermissionFilter | undefined) {
    this.#permissionFilter = permissionFilter;
    this.post(
      this.#engine.setPermissionFilter(
        permissionFilter === undefined ||
          permissionFilter === AllowAllPermissionFilter
          ? undefined
          : permissionFilter.createPredicate(this.#table.columnMap),
      ),
    );
  }

  get dataTable() {
    if (isDataTable(this.#table) || isSessionDataTable(this.#table)) {
      return this.#table;
    } else {
      throw Error(`[Viewport] table is not a DataTable`);
    }
  }

  get sessionId() {
    return this.#clientSessionId.sessionId;
  }

  get requestId() {
    return this.#requestId;
  }

  set requestId(requestId: string) {
    this.#requestId = requestId;
  }

  get viewPortDef() {
    return this.#viewPortDef;
  }

  get hasGroupBy() {
    return this.#engine.config.groupBy.length > 0;
  }

  /**
   * Keys of selected table rows. When grouped, a selected group row
   * contributes all of its leaf rows.
   */
  get selectedKeys(): ReadonlySet<string> {
    return this.hasGroupBy
      ? new Set(this.#engine.getSelectedRowKeys())
      : this.#engine.selectedKeys;
  }

  get selectedRowCount() {
    return this.#engine.selectedRowCount;
  }

  get visualLink() {
    return this.#viewPortVisualLink;
  }

  /** Apply queued table changes and publish resulting row updates */
  flush() {
    const batch = this.#engine.flush();
    this.post(batch);
    return batch;
  }

  getDataForCurrentRange() {
    return this.#engine.getCurrentRange();
  }

  postDataForCurrentRange() {
    this.post(this.#engine.getCurrentRange(), true);
  }

  setRange(range: VuuRange) {
    return this.post(this.#engine.setRange(range));
  }

  changeViewport({
    aggregations,
    columns,
    filterSpec,
    groupBy,
    sort,
  }: Partial<Omit<VuuViewportChangeRequest, "viewPortId" | "type">>) {
    const batch = this.post(
      this.#engine.setConfig({
        aggregations,
        columns: this.expandColumns(columns),
        filterSpec,
        groupBy,
        sort,
      }),
    );
    return batch;
  }

  openTreeNode(treeKey: string) {
    return this.post(this.#engine.openTreeNode(treeKey));
  }

  closeTreeNode(treeKey: string) {
    return this.post(this.#engine.closeTreeNode(treeKey));
  }

  selectRow(rowKey: string, preserveExistingSelection: boolean) {
    return this.selectionChanged(
      this.#engine.selectRow(rowKey, preserveExistingSelection),
    );
  }

  deselectRow(rowKey: string, preserveExistingSelection: boolean) {
    return this.selectionChanged(
      this.#engine.deselectRow(rowKey, preserveExistingSelection),
    );
  }

  selectAll() {
    return this.selectionChanged(this.#engine.selectAll());
  }

  deselectAll() {
    return this.selectionChanged(this.#engine.deselectAll());
  }

  selectRowRange(
    fromRowKey: string,
    toRowKey: string,
    preserveExistingSelection: boolean,
  ) {
    return this.selectionChanged(
      this.#engine.selectRowRange(
        fromRowKey,
        toRowKey,
        preserveExistingSelection,
      ),
    );
  }

  private selectionChanged(batch: ViewportBatch) {
    this.post(batch);
    this.emit("row-selection");
    return { ...batch, selectedRowCount: this.selectedRowCount };
  }

  /** distinct values of column across the table rows selected in this viewport */
  getSelectedValues(column: string) {
    return this.#engine.getSelectedValues(column);
  }

  getUniqueValues(column: string, startsWith?: string, limit?: number) {
    return this.#engine.getUniqueValues(column, startsWith, limit);
  }

  setLinkFilter(linkFilter: Parameters<ViewportEngine["setLinkFilter"]>[0]) {
    return this.post(this.#engine.setLinkFilter(linkFilter));
  }

  setVisualLink(link: RuntimeViewPortVisualLink) {
    if (this.#viewPortVisualLink) {
      this.#viewPortVisualLink.remove();
    }
    this.#viewPortVisualLink = link;
  }

  removeVisualLink() {
    if (this.#viewPortVisualLink) {
      this.#viewPortVisualLink.remove();
      this.#viewPortVisualLink = undefined;
    } else {
      throw Error(`[Viewport] removeVisualLink - no visual link in place`);
    }
  }

  destroy() {
    dirtyViewports.delete(this);
    if (this.#viewPortVisualLink) {
      this.#viewPortVisualLink.remove();
      this.#viewPortVisualLink = undefined;
    }
    this.#engine.destroy();
    this.removeAllListeners();
  }

  private post(batch: ViewportBatch, forceSizeMessage = false) {
    if (!this.#enabled) {
      return batch;
    }
    const { rows, size, sizeChanged } = batch;
    const time = Date.now();
    const table = this.#table as unknown as Table;
    const outboundQ = this.#outboundQ;
    const requestId = this.#requestId;

    if (sizeChanged || forceSizeMessage) {
      outboundQ.pushHighPriority(
        ViewPortUpdate(
          requestId,
          this,
          null,
          RowKeyUpdate("SIZE", null),
          NO_SIZE,
          "SIZE",
          size,
          time,
        ),
      );
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      outboundQ.pushHighPriority(
        ViewPortUpdate(
          requestId,
          this,
          table,
          RowKeyUpdate(row.rowKey, table),
          row.rowIndex,
          "ROW",
          size,
          time,
          row,
        ),
      );
    }
    return batch;
  }
}
