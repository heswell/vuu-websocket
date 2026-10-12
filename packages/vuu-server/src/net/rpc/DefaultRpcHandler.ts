import { RpcHandler } from "./RpcHandler";
import type { RpcFunction, RpcParams } from "./Rpc";
import { ViewPortTypeaheadRpcHandler } from "../../core/module/typeahead/ViewPortTypeaheadRpcHandler";
import { TableContainer } from "../../core/table/TableContainer";
import { RpcResult } from "@vuu-ui/vuu-protocol-types";

export class DefaultRpcHandler extends RpcHandler {
  #rpcHandlerMap = new Map<string, RpcFunction>();

  constructor(protected tableContainer: TableContainer) {
    super();
    ViewPortTypeaheadRpcHandler.forTableContainer(tableContainer).registerWith(
      this,
    );
  }

  /**
   * Registers an RPC function. Re-registering the same function under the
   * same name is a no-op; registering a different function under an
   * existing name throws.
   */
  registerRpc(functionName: string, handlerFunc: RpcFunction) {
    const existing = this.#rpcHandlerMap.get(functionName);
    if (existing === handlerFunc) {
      return;
    } else if (existing) {
      throw Error(`[DefaultRpcHandler] ${functionName} already registered`);
    }
    this.#rpcHandlerMap.set(functionName, handlerFunc);
  }

  processRpcRequest(
    rpcName: string,
    rpcParams: RpcParams,
  ): RpcResult | Promise<RpcResult> {
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
