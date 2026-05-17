import { Table } from "@heswell/data";
import { Provider, TableContainer } from "@heswell/vuu-server";

export class LinkParentProvider extends Provider {
  async load(tableContainer: TableContainer): Promise<void> {
    const table = tableContainer.getTable("LinkParent");
    table.insert(["1000000001", "data 1"]);
    table.insert(["1000000002", "data 2"]);
    table.insert(["1000000003", "data 2"]);
  }
}
