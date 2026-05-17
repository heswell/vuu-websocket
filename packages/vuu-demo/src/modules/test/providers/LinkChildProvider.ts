import { Provider, TableContainer } from "@heswell/vuu-server";

export class LinkChildProvider extends Provider {
  async load(tableContainer: TableContainer): Promise<void> {
    const table = tableContainer.getTable("LinkChild");
    [
      ["200001", "1000000001", "child 1 (linked to 001)"],
      ["200002", "1000000001", "child 2 (linked to 001)"],
      ["200003", "1000000001", "child 3 (linked to 001)"],
      ["200004", "1000000001", "child 4 (linked to 001)"],
      ["200005", "1000000001", "child 5 (linked to 001)"],
      ["200006", "1000000001", "child 6 (linked to 001)"],
      ["200007", "1000000001", "child 7 (linked to 001)"],
      ["200008", "1000000001", "child 8 (linked to 001)"],
      ["200009", "1000000002", "child 9 (linked to 002)"],
      ["200010", "1000000003", "child 10  (linked to 003)"],
    ].forEach((row) => table.insert(row));
  }
}
