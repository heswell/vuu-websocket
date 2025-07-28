import { Table } from "@heswell/data";
import {
  DefaultRpcHandler,
  ProviderContainer,
  TableContainer,
} from "@heswell/vuu-server";
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

  implementsService(serviceName: string): boolean {
    return serviceName === "addInstrumentsFromRows";
  }

  addInstrumentsFromRows() {
    console.log(`add Instruments from rows`);
  }

  get menuItems() {
    return {
      name: "ROOT",
      menus: [
        {
          context: "selected-rows",
          filter: "",
          name: "Edit Rows",
          rpcName: "VP_BULK_EDIT_BEGIN_RPC",
        },
        {
          context: "selected-rows",
          filter: "",
          name: "Add Rows to Orders",
          rpcName: "ADD_ROWS_TO_ORDERS",
        },
      ],
    } as VuuMenu;
  }
}
