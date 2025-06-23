import { Table } from "@heswell/data";
import { JoinTable } from "./JoinTable";

export class TableContainer {
  static #instance: TableContainer;

  public static get instance(): TableContainer {
    if (!TableContainer.#instance) {
      TableContainer.#instance = new TableContainer();
    }
    return TableContainer.#instance;
  }

  private constructor() {
    console.log("create TableContainer");
  }

  #tables: Map<string, Table> = new Map();

  addTable(table: Table) {
    console.log(`[TableContainer] add table ${table.name}`);
    this.#tables.set(table.name, table);
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

export default TableContainer.instance;
