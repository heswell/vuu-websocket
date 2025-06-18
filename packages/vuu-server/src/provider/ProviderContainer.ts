import { Table } from "@heswell/data";
import { IProvider } from "../Provider";
import tableContainer from "../core/table/TableContainer";

export class ProviderContainer {
  #providersByTable: Map<string, [Table, IProvider]> = new Map();

  add(table: Table, provider: IProvider) {
    if (this.#providersByTable.has(table.name)) {
      throw Error(
        `[ProviderContainer] add provider already extsts for table ${table.name}`
      );
    }
    this.#providersByTable.set(table.name, [table, provider]);
  }

  getProviderForTable(tableName: string) {
    const tableAndProvider = this.#providersByTable.get(tableName);
    if (tableAndProvider) {
      return tableAndProvider[1];
    } else {
      throw Error(
        `[ProviderContainer] getProviderForTable, no provider exists for table ${table.name}`
      );
    }
  }

  start() {
    console.log(`[ProviderContainer] start`);
    this.#providersByTable.forEach(([, provider]) => {
      provider.load(tableContainer);
    });
  }
}
