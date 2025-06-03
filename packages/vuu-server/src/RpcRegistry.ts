import { VuuRpcServiceRequest } from "@vuu-ui/vuu-protocol-types";
import { TableContainer } from "./ModuleContainer";

export type RpcHandler = {
  handleRpcCall: (rpcMessage: VuuRpcServiceRequest) => unknown;
  methods: string[];
  serviceName: string;
};
export type RpcHandlerFactory = (container: TableContainer) => RpcHandler;

export class RpcRegistry {
  #handlers = new Map<string, RpcHandler>();
  register(serviceName: string, handler: RpcHandler, methods: string[]) {
    // console.log(
    //   `register handler for rpc call ${serviceName}, ${methods.join(",")}`
    // );
    methods.forEach((method) =>
      this.#handlers.set(`${serviceName}|${method}`, handler)
    );
  }
  getHandler(serviceName: string, method: string) {
    const handler = this.#handlers.get(`${serviceName}|${method}`);
    if (handler) {
      return handler;
    } else {
      throw Error(
        `[RpcRegistry] no registered handler for ${serviceName} ${method}`
      );
    }
  }
}
