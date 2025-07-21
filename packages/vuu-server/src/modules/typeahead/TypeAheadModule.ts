import { TableContainer } from "@heswell/vuu-server";
import { VuuRpcServiceRequest, VuuTable } from "@vuu-ui/vuu-protocol-types";
import { ModuleFactory } from "@heswell/vuu-server";
import { RpcHandler } from "../../net/rpc/RpcHandler";

class TypeAheadRpcHandler extends RpcHandler {
  #tableContainer: TableContainer;
  constructor(tableContainer: any) {
    super();
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
    const table = this.#tableContainer.getTable(vuuTable.table);
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
    const table = this.#tableContainer.getTable(vuuTable.table);
    return table.getUniqueValuesForColumn(column, pattern).slice(0, 10);
  }

  implementsService(serviceName: string) {
    return serviceName === this.serviceName;
  }
}

export const TypeAheadModule = () =>
  ModuleFactory.withNameSpace("TYPEAHEAD")
    .addRpcHandler(
      (vuuServer) => new TypeAheadRpcHandler(vuuServer.tableContainer)
    )
    .asModule();
