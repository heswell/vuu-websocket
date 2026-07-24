import {
  VuuFilter,
  VuuGroupBy,
  VuuRange,
  VuuSort,
  VuuViewportChangeRequest,
} from "@vuu-ui/vuu-protocol-types";
import {
  DataView,
  DataViewConfig,
  RowUpdateHandler,
  Table,
  tableRowsMessageBody,
} from "@heswell/data";
import { ViewPortDef } from "../api/ViewPortDef";
import { Column } from "../api/TableDef";
import {
  DataTable,
  isDataTable,
  RowKeyUpdate,
} from "../core/table/InMemDataTable";
import { SelectionEventHandler } from "@heswell/data";
import { ClientSessionId } from "../net/ClientConnectionCreator";
import { VuuUser } from "../core/auths/VuuUser";
import { PublishQueue } from "../util/PublishQueue";
import { DataResponse } from "@heswell/data/src/store/rowset";
import { isSessionDataTable } from "../core/table/InMemSessionDataTable";

type ViewPortUpdateType = "SIZE" | "ROW";
export interface ViewPortSelection {
  viewPort: Viewport;
}

// TODO this needs some work
export type ViewPortStructuralFields = {
  columns: string[];
  filterSpec: VuuFilter;
  groupBy: VuuGroupBy;
  sort: VuuSort;
};

export function ViewPortSelection(viewPort: Viewport) {
  return new (class implements ViewPortSelection {
    constructor(public viewPort: Viewport) {}
  })(viewPort);
}

export interface ViewPortUpdate {
  index: number;
  key: RowKeyUpdate;
  vpRequestId: string;
  size: number;
  table: Table | null; // null for SIZE update
  ts: number;
  vp: Viewport;
  vpUpdate: ViewPortUpdateType;
}
export interface ViewPortRowUpdate extends Omit<ViewPortUpdate, "table"> {
  table: Table;
}

export const isViewPortRowUpdate = (
  vpu: ViewPortUpdate,
): vpu is ViewPortRowUpdate => vpu.vpUpdate === "ROW" && vpu.table !== null;

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
  );

export interface ViewPortVisualLink {
  childVp: Viewport;
  parentVp: Viewport;
  childColumn: Column;
  parentColumn: Column;
}

export class RuntimeViewPortVisualLink implements ViewPortVisualLink {
  constructor(
    public childVp: Viewport,
    public parentVp: Viewport,
    public childColumn: Column,
    public parentColumn: Column,
  ) {
    parentVp.on("row-selection", this.handleSelectionEvent);
  }

  remove() {
    this.parentVp.removeListener("row-selection", this.handleSelectionEvent);
    const dataResponse = this.childVp.filter({ filter: "" });
    if (dataResponse) {
      const { rows, size } = dataResponse;
      this.childVp.enqueue(
        tableRowsMessageBody(rows, size, this.childVp.id, true),
      );
    }
  }

  private handleSelectionEvent: SelectionEventHandler = () => {
    const { selectedKeys } = this.parentVp;
    if (selectedKeys.size === 0) {
      const dataResponse = this.childVp.filter({ filter: "" });
      if (dataResponse) {
        const { rows, size } = dataResponse;
        this.childVp.enqueue(
          tableRowsMessageBody(rows, size, this.childVp.id, true),
        );
      }
    } else if (selectedKeys.size === 1) {
      const [key] = this.parentVp.selectedKeys;
      const filter = `${this.childColumn.name} = "${key}"`;
      // // TODO need a way to ensure that this triggers update
      // console.log(`set filter ${filter}`);
      const dataResponse = this.childVp.filter({ filter });
      if (dataResponse) {
        const { rows, size } = dataResponse;
        this.childVp.enqueue(
          tableRowsMessageBody(rows, size, this.childVp.id, true),
        );
      }
    } else {
      const [key] = this.parentVp.selectedKeys;
      const values = Array.from(selectedKeys)
        .map((value) => `"${value}"`)
        .join(",");
      const filter = `${this.childColumn.name} in [${values}]`;
      // // TODO need a way to ensure that this triggers update
      // console.log(`set filter ${filter}`);
      const dataResponse = this.childVp.filter({ filter });
      if (dataResponse) {
        const { rows, size } = dataResponse;
        this.childVp.enqueue(
          tableRowsMessageBody(rows, size, this.childVp.id, true),
        );
      }
    }

    // 1) is the parentColumn the key of parent table, if so we have the selected values already
    // 2) if not, we must get the selected values using the selected keys

    // //todo simple if the targetColumnName is the key. If it isn't we need
    // // to find each row and determine the foreign key value

    // const selectedValues = this.pickUniqueSelectedValues(selection);
    // if (selectedValues.length === 0) {
    //   this.#childViewport.baseFilter = undefined;
    // } else if (selectedValues.length === 1) {
    //   this.#childViewport.baseFilter = {
    //     filter: `${this.#childColumnName} = "${selectedValues[0]}"`,
    //   };
    // } else {
    //   this.#childViewport.baseFilter = {
    //     filter: `${this.#childColumnName} in ["${selectedValues.join(
    //       '","'
    //     )}"]`,
    //   };
    // }
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

export class Viewport extends DataView {
  #enabled: boolean = true;
  #clientSessionId: ClientSessionId;
  #requestId: string = "";
  #outboundQ: PublishQueue<ViewPortUpdate>;
  #viewPortDef: ViewPortDef;
  #viewPortVisualLink?: RuntimeViewPortVisualLink;

  constructor(
    id: string,
    user: VuuUser,
    clientSessionId: ClientSessionId,
    outboundQ: PublishQueue<ViewPortUpdate>,
    structuralFields: ViewPortStructuralFields,
    range: VuuRange,
    table: DataTable,
    config: DataViewConfig,
    // in scala, this is passed with config as 'structural'
    viewPortDef: ViewPortDef,
  ) {
    super(id, table, config);
    this.#clientSessionId = clientSessionId;
    this.#outboundQ = outboundQ;
    this.#viewPortDef = viewPortDef;
  }

  get columns() {
    return this.#viewPortDef.columns;
  }

  get enabled() {
    return this.#enabled;
  }

  set enabled(enabled: boolean) {
    this.#enabled = enabled;
  }

  get dataTable() {
    if (isDataTable(this.table) || isSessionDataTable(this.table)) {
      return this.table as DataTable;
    } else {
      throw Error(`[Viewport] table is not a DataTable`);
    }
  }

  get keys() {
    return this.rowSet.keys;
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

  getSelection() {
    return this.selectedRowKeyIndex;
  }

  /** deprecated */
  select(selection: number[]) {
    const response = super.select(selection);
    setTimeout(() => {
      this.emit("row-selection");
    }, 0);
    return response;
  }

  selectRow(rowKey: string, preserveExistingSelection: boolean) {
    const dataResponse = super.selectRow(rowKey, preserveExistingSelection);
    this.postDataResponse(dataResponse);
    return dataResponse;
  }

  deselectRow(rowKey: string, preserveExistingSelection: boolean) {
    const dataResponse = super.deselectRow(rowKey, preserveExistingSelection);
    this.postDataResponse(dataResponse);
    return dataResponse;
  }

  selectRowRange(
    fromRowKey: string,
    toRowKey: string,
    preserveExistingSelection: boolean,
  ) {
    const dataResponse = super.selectRowRange(
      fromRowKey,
      toRowKey,
      preserveExistingSelection,
    );
    this.postDataResponse(dataResponse);
    return dataResponse;
  }

  changeViewport(
    options: Omit<VuuViewportChangeRequest, "viewPortId">,
  ): DataResponse | undefined {
    const dataResponse = super.changeViewport(options);
    this.postDataResponse(dataResponse);
    return dataResponse;
  }

  setRange(range: VuuRange, useDelta?: boolean) {
    const dataResponse = super.setRange(range, useDelta);
    this.postDataResponse(dataResponse);
    return dataResponse;
  }

  setVisualLink(link: RuntimeViewPortVisualLink) {
    console.log(`[Viewport] setVisualLink`);
    this.#viewPortVisualLink = link;
  }

  removeVisualLink() {
    if (this.#viewPortVisualLink) {
      this.#viewPortVisualLink.remove();
      this.#viewPortVisualLink = undefined;
    } else {
      throw Error(`[Viewport] removeVisualLink - no visual link in plave`);
    }
  }

  postDataForCurrentRange() {
    const { rows, size } = this.getDataForCurrentRange();
    this.postDataResponse({ rows, size, sizeMessageRequired: true });
  }

  postDataResponse(dataResponse: DataResponse | void) {
    if (dataResponse && this.#enabled) {
      const { size, rows, sizeMessageRequired } = dataResponse;
      const time = Date.now();

      if (sizeMessageRequired) {
        this.#outboundQ.pushHighPriority(
          ViewPortUpdate(
            this.#requestId,
            this,
            null,
            RowKeyUpdate("SIZE", null),
            -1,
            "SIZE",
            size,
            time,
          ),
        );
      }

      for (const row of rows) {
        this.#outboundQ.pushHighPriority(
          ViewPortUpdate(
            this.#requestId,
            this,
            this.table,
            RowKeyUpdate(row.rowKey, this.table),
            row.rowIndex,
            "ROW",
            size,
            time,
          ),
        );
      }
    }
  }
}
