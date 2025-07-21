import { VuuMenu, VuuRpcServiceRequest } from "@vuu-ui/vuu-protocol-types";
import { VuuServer } from "../../core/VuuServer";

export type RpcHandlerFunc = (vuuServer: VuuServer) => RpcHandler;

const NoMenu: VuuMenu = { name: "", menus: [] } as const;

export class RpcHandler {
  handleRpcCall(rpcMessage: VuuRpcServiceRequest) {}
  get menuItems() {
    return NoMenu;
  }
  // abstract methods?: string[];
  // abstract serviceName?: string;
  implementsService(serviceName: string) {
    return false;
  }
}
