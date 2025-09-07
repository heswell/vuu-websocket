import { Table } from "@heswell/data";
import { JoinTableProvider } from "../../provider/JoinTableProvider";
import { VuuTable } from "@vuu-ui/vuu-protocol-types";
import { DataTable } from "./InMemDataTable";
import { InMemSessionDataTable } from "./InMemSessionDataTable";

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

  getTable<T = Table>(tableName: string) {
    const table = this.#tables.get(tableName) as T;
    if (table) {
      return table;
    } else {
      throw Error(`[TableContainer] no table ${tableName}`);
    }
  }

  createSimpleSessionTable(baseTable: DataTable, sessionId: string) {
    const table = new InMemSessionDataTable(
      sessionId,
      baseTable.tableDef,
      this.joinProvider
    );
    this.#tables.set(table.name, table);
    return table;
  }
}
