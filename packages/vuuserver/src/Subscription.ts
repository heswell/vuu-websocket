import { DataView as View, Table } from "@heswell/data";
import { ISession } from "@heswell/server-types";
import {
  VuuClientMessage,
  VuuViewportCreateRequest,
} from "@vuu-ui/vuu-protocol-types";

export class Subscription {
  public view: View;

  constructor(
    table: Table,
    viewPortId: string,
    message: VuuClientMessage<VuuViewportCreateRequest>,
    session: ISession
  ) {
    const {
      columns: requestedColumns,
      filterSpec,
      groupBy,
      range,
      sort,
    } = message.body;
    const { name: tablename, columns: availableColumns } = table;
    const columns =
      requestedColumns.length > 0
        ? requestedColumns
        : availableColumns.map((c) => c.name);

    this.view = new View(viewPortId, table, {
      columns,
      filterSpec,
      groupBy,
      range,
      sort,
    });
  }

  clear() {
    console.log(`clear subscription`);
    this.view.destroy();
    // @ts-ignore
    this.view = undefined;
  }
}
