import { Table } from "@heswell/data";
import { Service } from "@heswell/vuu-module";
import { VuuMenu } from "@vuu-ui/vuu-protocol-types";

export class InstrumentService extends Service {
  constructor(table: Table) {
    super(table);
    console.log("Instrument Service created");
  }

  getMenu() {
    return {
      name: "ROOT",
      menus: [
        {
          context: "selected-rows",
          filter: "",
          name: "Edit Rows",
          rpcName: "VP_BULK_EDIT_BEGIN_RPC",
        },
      ],
    } as VuuMenu;
  }
}
