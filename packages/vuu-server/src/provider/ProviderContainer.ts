import { Table } from "@heswell/data";
import { IProvider } from "./Provider";
import { JoinTableProvider } from "./JoinTableProvider";
import { TableContainer } from "../core/table/TableContainer";
import {
  DefaultLifecycleEnabled,
  LifecycleContainer,
} from "../toolbox/thread/LifecycleContainer";

export class ProviderContainer extends DefaultLifecycleEnabled {
  readonly lifecycleId = "providerContainer";
  readonly #providersByTable = new Map<string, [Table, IProvider]>();

  constructor(
    private readonly joinProvider: JoinTableProvider,
    private readonly tableContainer: TableContainer,
    private readonly lifecycle: LifecycleContainer,
  ) {
    super();
    console.log("create ProviderContainer");
    lifecycle.apply(joinProvider);
    lifecycle.apply(this);
  }

  add(table: Table, provider: IProvider) {
    if (this.#providersByTable.has(table.name)) {
      throw Error(
        `[ProviderContainer] add provider already exists for table ${table.name}`,
      );
    }

    provider.bind(this.tableContainer);
    this.#providersByTable.set(table.name, [table, provider]);
    this.lifecycle.apply(provider).dependsOn(this.joinProvider);
    this.lifecycle.apply(this).dependsOn(provider);
  }

  getProviderForTable(tableName: string) {
    const tableAndProvider = this.#providersByTable.get(tableName);
    if (tableAndProvider) {
      return tableAndProvider[1];
    }
    throw Error(
      `[ProviderContainer] getProviderForTable, no provider exists for table ${tableName}`,
    );
  }
}
