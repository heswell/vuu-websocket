import { Table } from "@heswell/data";
import { JoinTableProvider } from "../../provider/JoinTableProvider";
import { VuuTable } from "@vuu-ui/vuu-protocol-types";

export class TableContainer {
  constructor(private joinProvider: JoinTableProvider) {
    console.log("create TableContainer");
  }

  #tables: Map<string, Table> = new Map();

  addTable(table: Table) {
    console.log(`[TableContainer] add table ${table.name}`);
    this.#tables.set(table.name, table);
  }

  getDefinedTables(): VuuTable[] {
    return this.#tables
      .values()
      .map((table) => table.schema.table)
      .toArray();
  }

  getTable(tableName: string) {
    const table = this.#tables.get(tableName);
    if (table) {
      return table;
    } else {
      throw Error(`[TableContainer] no table ${tableName}`);
    }
  }
}
