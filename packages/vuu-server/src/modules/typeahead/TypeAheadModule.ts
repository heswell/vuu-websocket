import { Module, ModuleContainer } from "@heswell/vuu-server";
import { VuuRpcServiceRequest, VuuTable } from "@vuu-ui/vuu-protocol-types";
import type { TableContainer } from "../../core/module/ModuleContainer";
import { RpcHandler } from "../../RpcRegistry";

class TypeAheadRpcHandler implements RpcHandler {
  #tableContainer: TableContainer;
  constructor(tableContainer: any) {
    this.#tableContainer = tableContainer;
  }

  public serviceName = "TypeAheadRpcHandler";

  // TODO use decorators to decorat rpc methods  instead of declaring them like this ?
  get methods() {
    return ["getUniqueFieldValues", "getUniqueFieldValuesStartingWith"];
  }

  handleRpcCall({ method, params, service }: VuuRpcServiceRequest) {
    switch (method) {
      case "getUniqueFieldValues":
        return this.getUniqueFieldValues(...params);
      case "getUniqueFieldValuesStartingWith":
        return this.getUniqueFieldValuesStartingWith(...params);
      default:
        throw Error(
          `[TypeaheadRpcHandler] handler invoked for invalid prc request ${service} ${method}}`
        );
    }
  }

  getUniqueFieldValues(vuuTable: VuuTable, column: string) {
    console.log(
      `[TypeAheadRpcHandler] getUniqueFieldValues col: ${column} (${vuuTable.table})`
    );
    const table = this.#tableContainer.getTable(vuuTable);
    return table.getUniqueValuesForColumn(column).slice(0, 10);
  }

  getUniqueFieldValuesStartingWith(
    vuuTable: VuuTable,
    column: string,
    pattern: string
  ) {
    console.log(
      `[TypeAheadRpcHandler] getUniqueFieldValuesStartingWith ${pattern} col: ${column} (${vuuTable.table})`
    );
    const table = this.#tableContainer.getTable(vuuTable);
    return table.getUniqueValuesForColumn(column, pattern).slice(0, 10);
  }
}

export const TypeAheadModule = () =>
  ModuleContainer.withNameSpace("TYPEAHEAD")
    .addRpcHandler((tableContainer) => new TypeAheadRpcHandler(tableContainer))
    .asModule();
