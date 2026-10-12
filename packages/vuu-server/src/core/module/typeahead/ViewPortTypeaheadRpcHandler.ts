import { DefaultRpcHandler } from "../../../net/rpc/DefaultRpcHandler";
import { RpcParams } from "../../../net/rpc/Rpc";
import { RpcSuccessResult } from "../../../net/rpc/RpcResult";
import { RpcNames } from "../../../util/RpcNames";
import { TableContainer } from "../../table/TableContainer";
import { DataTable } from "../../table/InMemDataTable";

type TypeaheadRpcParams = {
  column: string;
  module: string;
  starts?: string;
  table: string;
};

const MAX_SUGGESTIONS = 10;

/**
 * Typeahead suggestions. Values are drawn from the rows visible in the
 * requesting viewport (respecting filters and permissions) when available,
 * otherwise from the whole table.
 */
export class ViewPortTypeaheadRpcHandler {
  static #instances = new WeakMap<
    TableContainer,
    ViewPortTypeaheadRpcHandler
  >();

  /**
   * One stateless typeahead handler per TableContainer, shared by every
   * DefaultRpcHandler, so creating a handler per viewport does no repeated
   * typeahead setup.
   */
  static forTableContainer(tableContainer: TableContainer) {
    let instance = ViewPortTypeaheadRpcHandler.#instances.get(tableContainer);
    if (instance === undefined) {
      instance = new ViewPortTypeaheadRpcHandler(tableContainer);
      ViewPortTypeaheadRpcHandler.#instances.set(tableContainer, instance);
    }
    return instance;
  }

  #tableContainer: TableContainer;
  constructor(tableContainer: TableContainer) {
    this.#tableContainer = tableContainer;
  }

  /** Idempotent: registering on the same registry twice is a no-op. */
  registerWith(rpcRegistry: DefaultRpcHandler) {
    rpcRegistry.registerRpc(
      RpcNames.UniqueFieldValuesRpc,
      this.processGetUniqueFieldValuesRequest,
    );
    rpcRegistry.registerRpc(
      RpcNames.UniqueFieldValuesStartsWithRpc,
      this.processGetUniqueFieldValuesStartWithRequest,
    );
  }

  processGetUniqueFieldValuesRequest = (params: RpcParams) =>
    RpcSuccessResult(
      this.getUniqueFieldValues(params as RpcParams<TypeaheadRpcParams>),
    );

  processGetUniqueFieldValuesStartWithRequest = (params: RpcParams) => {
    const typeaheadParams = params as RpcParams<TypeaheadRpcParams>;
    return RpcSuccessResult(
      this.getUniqueFieldValues(
        typeaheadParams,
        typeaheadParams.namedParams.starts ?? "",
      ),
    );
  };

  private getUniqueFieldValues(
    {
      namedParams: { column, table: tableName },
      viewport,
    }: RpcParams<TypeaheadRpcParams>,
    starts?: string,
  ) {
    if (viewport && viewport.table.name === tableName) {
      return viewport.getUniqueValues(column, starts, MAX_SUGGESTIONS);
    }
    const table = this.#tableContainer.getTable<DataTable>(tableName);
    return starts
      ? table.columnValueProvider.getUniqueValuesStartingWith(
          column,
          starts,
          MAX_SUGGESTIONS,
        )
      : table.columnValueProvider.getUniqueValues(column, MAX_SUGGESTIONS);
  }
}
