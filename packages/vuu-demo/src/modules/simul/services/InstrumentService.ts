import { Table } from "@heswell/data";
import {
  DefaultRpcHandler,
  NoAction,
  ProviderContainer,
  TableContainer,
} from "@heswell/vuu-server";
import {
  SelectionViewPortMenuItem,
  ViewPortMenu,
} from "@heswell/vuu-server/src/viewport/ViewPortMenu";
import { VuuMenu, VuuRpcServiceRequest } from "@vuu-ui/vuu-protocol-types";

export class InstrumentService extends DefaultRpcHandler {
  constructor(
    table: Table,
    providerContainer: ProviderContainer,
    tableContainer: TableContainer
  ) {
    super(tableContainer);
    console.log("=======> Instrument Service created", {
      tableContainer,
    });
  }

  handleRpcCall(rpcMessage: VuuRpcServiceRequest) {
    console.log(`rpc message received`);
  }

  private editRows = () => {
    console.log("edit rows");
    return new NoAction();
  };

  private addRowsToOrders = () => {
    console.log("addRowsToOrders");
    return new NoAction();
  };

  get menuItems() {
    // prettier-ignore
    return ViewPortMenu(
      new SelectionViewPortMenuItem( "Edit rows", "", this.editRows, "VP_BULK_EDIT_BEGIN_RPC" ),
      new SelectionViewPortMenuItem( "Add rows to orders", "", this.addRowsToOrders, "ADD_ROWS_TO_ORDERS" )
    )
  }
}
