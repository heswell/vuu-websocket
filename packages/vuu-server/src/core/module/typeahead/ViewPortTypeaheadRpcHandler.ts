import { SortSet } from "@heswell/data";
import { DefaultRpcHandler } from "../../../net/rpc/DefaultRpcHandler";
import { RpcParams } from "../../../net/rpc/Rpc";
import { RpcNames } from "../../../net/ws/RpcNames";
import { TableContainer } from "../../table/TableContainer";
import { Column } from "../../../api/TableDef";
import { DataTable } from "../../table/InMemDataTable";

type TypeaheadRpcParams = {
  column: string;
  module: string;
  table: string;
};

export class ViewPortTypeaheadRpcHandler {
  #tableContainer: TableContainer;
  constructor(rpcRegistry: DefaultRpcHandler, tableContainer: TableContainer) {
    this.#tableContainer = tableContainer;
    rpcRegistry.registerRpc(
      RpcNames.UniqueFieldValuesRpc,
      this.processGetUniqueFieldValuesRequest
    );
    rpcRegistry.registerRpc(
      RpcNames.UniqueFieldValuesStartsWithRpc,
      this.processGetUniqueFieldValuesStartWithRequest
    );
  }

  processGetUniqueFieldValuesRequest = ({
    namedParams: { column, module, table },
    viewPortColumns,
    vpKeys,
  }: RpcParams<TypeaheadRpcParams>) => {
    console.log(
      `[ViewPortTypoeaheadRpcHandler] processGetUniqueFieldValuesRequest ${table} ${column}`
    );
    if (viewPortColumns && vpKeys) {
      return this.getUniqueFieldValues(
        table,
        module,
        column,
        viewPortColumns,
        vpKeys
      );
    } else {
      throw Error(
        `[ViewPortTypeaheadRpcHandler] processGetUniqueFieldValuesRequest required viewPortColumns and vpKeys`
      );
    }
  };

  processGetUniqueFieldValuesStartWithRequest = (params: RpcParams) => {
    console.log(
      `[ViewPortTypoeaheadRpcHandler] processGetUniqueFieldValuesStartWithRequest`
    );
    return {};
  };

  private getUniqueFieldValues(
    tableName: string,
    module: string,
    column: string,
    viewPortColumns: Column[],
    vpKeys: number[] | SortSet
  ) {
    const table = this.#tableContainer.getTable<DataTable>(tableName);
    const start = performance.now();
    const values = table.columnValueProvider.getUniqueValuesVPColumn(
      column,
      viewPortColumns,
      vpKeys
    );
    const end = performance.now();
    console.log(
      `[ViewPortTypeaheadRpcHandler] toom ${end - start}ms to get suggestions`
    );
    console.log(values?.join(","));
    return values;
  }
}
