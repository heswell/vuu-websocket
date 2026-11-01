import { DefaultRpcHandler } from "@heswell/vuu-server";
import type { TableContainer } from "@heswell/vuu-server";

export class BasketTradingConstituentService extends DefaultRpcHandler {
  constructor(tableContainer: TableContainer) {
    super(tableContainer);
    this.registerRpc("addConstituent", () => ({
      type: "ERROR_RESULT",
      errorMessage: "addConstituent not implemented",
    }));
  }
}
