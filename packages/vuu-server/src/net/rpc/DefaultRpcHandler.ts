import { RpcHandler } from "./RpcHandler";
import type { RpcFunction, RpcParams } from "./Rpc";
import { ViewPortTypeaheadRpcHandler } from "../../core/module/typeahead/ViewPortTypeaheadRpcHandler";
import { TableContainer } from "../../core/table/TableContainer";
import { RpcResult } from "@vuu-ui/vuu-protocol-types";

export class DefaultRpcHandler extends RpcHandler {
  #rpcHandlerMap = new Map<string, RpcFunction>();

  constructor(protected tableContainer: TableContainer) {
    super();
    new ViewPortTypeaheadRpcHandler(this, tableContainer);
  }

  registerRpc(functionName: string, handlerFunc: RpcFunction) {
    if (this.#rpcHandlerMap.has(functionName)) {
      throw Error(`[DefaultRpcHandler] ${functionName} already registered`);
    }
    this.#rpcHandlerMap.set(functionName, handlerFunc);
  }

  processRpcRequest(rpcName: string, rpcParams: RpcParams): RpcResult {
    const rpcHandler = this.#rpcHandlerMap.get(rpcName);
    if (rpcHandler) {
      return rpcHandler(rpcParams);
    } else {
      throw Error(
        `[DefaultRpcHandler] could not find rpcMethodHandler ${rpcName}`,
      );
    }
  }
}
