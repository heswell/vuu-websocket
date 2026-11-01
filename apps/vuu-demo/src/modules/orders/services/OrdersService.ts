import { Table } from "@heswell/vuu-table";
import {
  getLogger,
  DefaultRpcHandler,
  isDataTable,
  type MenuRpcSession,
  NoAction,
  OpenDialogViewPortAction,
  ProviderContainer,
  SelectionViewPortMenuItem,
  TableContainer,
  ViewPortMenu,
  ViewPortSelection,
} from "@heswell/vuu-server";
import { VuuRpcServiceRequest } from "@vuu-ui/vuu-protocol-types";

const log = getLogger("demo.orders");

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
    log.debug(`rpc message received`);
  }

  private cancelOrders = (
    selection: ViewPortSelection,
    _sessionId: string,
    session: MenuRpcSession,
  ) => {
    const baseTable = this.#tableContainer.getTable("parentOrders");

    if (isDataTable(baseTable)) {
      const sessionTable = this.#tableContainer.createSimpleSessionTable(
        baseTable,
        session
      );

      selection.rowKeys.forEach((key) => {
        const row = baseTable.getRowAtKey(key);
        log.debug(`add row ${row.join(",")}`);
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
