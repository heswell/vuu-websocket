import { Table } from "@heswell/data";
import {
  DefaultRpcHandler,
  NoAction,
  ProviderContainer,
  TableContainer,
} from "@heswell/vuu-server";
import { isDataTable } from "@heswell/vuu-server/src/core/table/InMemDataTable";
import { ViewPortSelection } from "@heswell/vuu-server/src/viewport/Viewport";
import { OpenDialogViewPortAction } from "@heswell/vuu-server/src/viewport/ViewPortAction";
import {
  SelectionViewPortMenuItem,
  ViewPortMenu,
} from "@heswell/vuu-server/src/viewport/ViewPortMenu";
import { VuuRpcServiceRequest } from "@vuu-ui/vuu-protocol-types";

export class OrdersService extends DefaultRpcHandler {
  #tableContainer: TableContainer;
  constructor(
    table: Table,
    providerContainer: ProviderContainer,
    tableContainer: TableContainer
  ) {
    super(tableContainer);
    this.#tableContainer = tableContainer;
  }

  handleRpcCall(rpcMessage: VuuRpcServiceRequest) {
    console.log(`rpc message received`);
  }

  private cancelOrders = (selection: ViewPortSelection, sessionId: string) => {
    const baseTable = this.#tableContainer.getTable("parentOrders");

    if (isDataTable(baseTable)) {
      const sessionTable = this.#tableContainer.createSimpleSessionTable(
        baseTable,
        sessionId
      );

      const { rowKeyIndex } = selection;
      rowKeyIndex.forEach((_, key) => {
        const row = baseTable.getRowAtKey(key);
        console.log(`add row ${row.join(",")}`);
        sessionTable.processUpdate(key, row.slice());
      });

      return OpenDialogViewPortAction(
        {
          table: sessionTable.name,
          module: sessionTable.tableDef.getModule().name,
        },
        "cancel-confirm"
      );
    }

    return NoAction();
  };

  get menuItems() {
    // prettier-ignore
    return ViewPortMenu(
      new SelectionViewPortMenuItem( "Cancel Order", "", this.cancelOrders, "CANCEL_ORDER" )
    );
  }
}
