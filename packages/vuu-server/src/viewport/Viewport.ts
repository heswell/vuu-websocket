import { ServerMessageBody, VuuLink, VuuRow } from "@vuu-ui/vuu-protocol-types";
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

  protected enqueue(messageBody: ServerMessageBody) {
    this.#session.enqueue("NA", messageBody);
  }
}
