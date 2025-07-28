import {
  VuuMenu,
  VuuRpcServiceRequest,
  VuuRpcViewportRequest,
} from "@vuu-ui/vuu-protocol-types";
import { VuuServer } from "../../core/VuuServer";
import { RpcParams } from "./Rpc";

export type RpcHandlerFunc = (vuuServer: VuuServer) => RpcHandler;

const NoMenu: VuuMenu = { name: "", menus: [] } as const;

export class RpcHandler {
  processRpcCall(rpcMessage: VuuRpcServiceRequest) {
    console.log(`[RpcHandler] VuuRpcServiceRequest`);
    return undefined;
  }

  processViewPortRpcCall(methodName: string, rpcParams: RpcParams): unknown {
    return undefined;
  }
  get menuItems() {
    return NoMenu;
  }
  // abstract methods?: string[];
  // abstract serviceName?: string;
  implementsService(serviceName: string) {
    return false;
  }
}
