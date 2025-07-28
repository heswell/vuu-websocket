import {
  ServerMessageBody,
  VuuLink,
  VuuRow,
  VuuTable,
} from "@vuu-ui/vuu-protocol-types";
import { ISession } from "../server-types";
import {
  DataView,
  DataViewConfig,
  Table,
  tableRowsMessageBody,
} from "@heswell/data";
import { ViewPortDef } from "../api/ViewPortDef";

export class Viewport extends DataView {
  #links?: VuuLink[];
  #session: ISession;
  #viewPortDef: ViewPortDef;

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

  get keys() {
    return this.rowSet.keys;
  }

  get sessionId() {
    return this.#session.id;
  }

  get viewPortDef() {
    return this.#viewPortDef;
  }

  select(selection: number[]) {
    const response = super.select(selection);
    setTimeout(() => {
      this.emit("row-selection");
    }, 0);
    return response;
  }

  getUniqueFieldValues(vuuTable: VuuTable, column: string) {
    return ["blah"];
  }

  getUniqueFieldValuesStartingWith(
    vuuTable: VuuTable,
    column: string,
    pattern: string
  ) {
    return ["blootah"];
  }

  protected enqueue(messageBody: ServerMessageBody) {
    this.#session.enqueue("NA", messageBody);
  }
}
