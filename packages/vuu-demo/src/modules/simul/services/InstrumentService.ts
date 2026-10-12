import { Table } from "@heswell/vuu-table";
import {
  type DataTable,
  DefaultRpcHandler,
  EditSessionRpcHandler,
  NoAction,
  ProviderContainer,
  SelectionViewPortMenuItem,
  TableContainer,
  ViewPortMenu,
} from "@heswell/vuu-server";
import { VuuMenu, VuuRpcServiceRequest } from "@vuu-ui/vuu-protocol-types";

export class InstrumentService extends EditSessionRpcHandler {
  constructor(
    table: DataTable,
    providerContainer: ProviderContainer,
    tableContainer: TableContainer,
  ) {
    super(tableContainer);
    console.log("[InstrumentService] constructor", );
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
