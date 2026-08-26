import { EditSessionRpcHandler, TableContainer } from "@heswell/vuu-server";

export class ModuleDiscoveryService extends EditSessionRpcHandler {
  constructor(tableContainer: TableContainer) {
    super(tableContainer);
  }
}
