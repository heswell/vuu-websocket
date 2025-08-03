import { Table } from "@heswell/data";
import {
  DefaultRpcHandler,
  ProviderContainer,
  TableContainer,
} from "@heswell/vuu-server";
import {
  SelectionViewPortMenuItem,
  ViewPortMenu,
} from "@heswell/vuu-server/src/viewport/ViewPortMenu";
import { VuuRpcServiceRequest } from "@vuu-ui/vuu-protocol-types";

export class OrdersService extends DefaultRpcHandler {
  constructor(
    table: Table,
    providerContainer: ProviderContainer,
    tableContainer: TableContainer
  ) {
    super(tableContainer);
    console.log("=======> Orders Service created", {
      tableContainer,
    });
  }

  handleRpcCall(rpcMessage: VuuRpcServiceRequest) {
    console.log(`rpc message received`);
  }

  private cancelOrders = () => {
    console.log("cancel orders");
  };

  get menuItems() {
    // prettier-ignore
    return ViewPortMenu(
      new SelectionViewPortMenuItem( "Cancel Order", "", this.cancelOrders, "CANCEL_ORDER" )
    );
  }
}
