import { RpcHandler } from "./RpcHandler";
import type { RpcFunction, RpcParams } from "./Rpc";
import { ViewPortTypeaheadRpcHandler } from "../../core/module/typeahead/ViewPortTypeaheadRpcHandler";
import { TableContainer } from "../../core/table/TableContainer";

export class DefaultRpcHandler extends RpcHandler {
  #rpcHandlerMap = new Map<string, RpcFunction>();

  constructor(tableContainer: TableContainer) {
    super();
    new ViewPortTypeaheadRpcHandler(this, tableContainer);
  }

  registerRpc(functionName: string, handlerFunc: RpcFunction) {
    if (this.#rpcHandlerMap.has(functionName)) {
      throw Error(`[DefaultRpcHandler] ${functionName} already registered`);
    }
    this.#rpcHandlerMap.set(functionName, handlerFunc);
  }

  processViewPortRpcCall(methodName: string, rpcParams: RpcParams) {
    const rpcHandler = this.#rpcHandlerMap.get(methodName);
    if (rpcHandler) {
      return rpcHandler(rpcParams);
    } else {
      throw Error(
        `[DefaultRpcHandler] could not find rpcMethodHandler ${methodName}`
      );
    }
  }
}
