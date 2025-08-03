import { ServerMessageBody, VuuTable } from "@vuu-ui/vuu-protocol-types";
import { ISession } from "../server-types";
import {
  DataView,
  DataViewConfig,
  Table,
  tableRowsMessageBody,
} from "@heswell/data";
import { ViewPortDef } from "../api/ViewPortDef";
import { Column } from "../api/TableDef";
import { DataTable, isDataTable } from "../core/table/InMemDataTable";
import { SelectionEventHandler } from "@heswell/data";

export interface ViewPortSelection {
  rowKeyIndex: Map<string, number>;
  viewPort: Viewport;
}

export function ViewPortSelection(
  selection: Map<string, number>,
  viewPort: Viewport
) {
  return new (class implements ViewPortSelection {
    constructor(
      public rowKeyIndex: Map<string, number>,
      public viewPort: Viewport
    ) {}
  })(selection, viewPort);
}

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
    public parentColumn: Column
  ) {
    parentVp.on("row-selection", this.handleSelectionEvent);
  }

  remove() {
    this.parentVp.removeListener("row-selection", this.handleSelectionEvent);
    const dataResponse = this.childVp.filter({ filter: "" });
    if (dataResponse) {
      const { rows, size } = dataResponse;
      this.childVp.enqueue(
        tableRowsMessageBody(rows, size, this.childVp.id, true)
      );
    }
  }

  private handleSelectionEvent: SelectionEventHandler = () => {
    console.log(
      `selection event selected keys ${this.parentVp.selectedKeys.join(" , ")}`
    );
    const { selectedKeys } = this.parentVp;
    if (selectedKeys.length === 0) {
      const dataResponse = this.childVp.filter({ filter: "" });
      if (dataResponse) {
        const { rows, size } = dataResponse;
        this.childVp.enqueue(
          tableRowsMessageBody(rows, size, this.childVp.id, true)
        );
      }
    } else if (selectedKeys.length === 1) {
      const [key] = this.parentVp.selectedKeys;
      const filter = `${this.childColumn.name} = "${key}"`;
      // // TODO need a way to ensure that this triggers update
      // console.log(`set filter ${filter}`);
      const dataResponse = this.childVp.filter({ filter });
      if (dataResponse) {
        const { rows, size } = dataResponse;
        this.childVp.enqueue(
          tableRowsMessageBody(rows, size, this.childVp.id, true)
        );
      }
    } else {
      const [key] = this.parentVp.selectedKeys;
      const values = selectedKeys.map((value) => `"${value}"`).join(",");
      const filter = `${this.childColumn.name} in [${values}]`;
      // // TODO need a way to ensure that this triggers update
      // console.log(`set filter ${filter}`);
      const dataResponse = this.childVp.filter({ filter });
      if (dataResponse) {
        const { rows, size } = dataResponse;
        this.childVp.enqueue(
          tableRowsMessageBody(rows, size, this.childVp.id, true)
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
  parentColumn: Column
) =>
  new RuntimeViewPortVisualLink(childVp, parentVp, childColumn, parentColumn);

export class Viewport extends DataView {
  #session: ISession;
  #viewPortDef: ViewPortDef;
  #viewPortVisualLink?: RuntimeViewPortVisualLink;

  constructor(
    session: ISession,
    id: string,
    table: Table,
    config: DataViewConfig,
    // in scala, this is passed with config as 'structural'
    viewPortDef: ViewPortDef
  ) {
    super(id, table, config);
    this.#session = session;
    this.#viewPortDef = viewPortDef;
  }

  get columns() {
    return this.#viewPortDef.columns;
  }

  get dataTable() {
    if (isDataTable(this.table)) {
      return this.table as DataTable;
    } else {
      throw Error(`[Viewport] table is not a DataTable`);
    }
  }

  get keys() {
    return this.rowSet.keys;
  }

  get sessionId() {
    return this.#session.id;
  }

  get viewPortDef() {
    return this.#viewPortDef;
  }

  getSelection() {
    return this.selectedRowKeyIndex;
  }

  select(selection: number[]) {
    const response = super.select(selection);
    setTimeout(() => {
      this.emit("row-selection");
    }, 0);
    return response;
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

  enqueue(messageBody: ServerMessageBody) {
    this.#session.enqueue("", messageBody);
  }
}
