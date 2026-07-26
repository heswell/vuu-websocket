import { VuuServer } from "../../core/VuuServer";
import { RpcParams } from "./Rpc";
import {
  EmptyViewPortMenu,
  ViewPortMenu,
  ViewPortMenuFolder,
  ViewPortMenuItem,
} from "../../viewport/ViewPortMenu";
import { RpcResult } from "@vuu-ui/vuu-protocol-types";

export type RpcHandlerFunc = (vuuServer: VuuServer) => RpcHandler;

export class RpcHandler {
  processRpcRequest(
    rpcName: string,
    _rpcParams: RpcParams,
  ): RpcResult | Promise<RpcResult> {
    return {
      type: "ERROR_RESULT",
      errorMessage: `rpc service ${rpcName} not implemented`,
    };
  }
  get menuItems(): ViewPortMenu {
    return new EmptyViewPortMenu();
  }

  get menuMap() {
    return this.menusAsMap();
  }

  private menusAsMap() {
    const foldMenus = (
      menu: ViewPortMenu,
      map = new Map<string, ViewPortMenuItem>(),
    ): Map<string, ViewPortMenuItem> => {
      if (menu instanceof ViewPortMenuFolder) {
        menu.menus.forEach((menu) => foldMenus(menu, map));
      } else if (menu instanceof ViewPortMenuItem) {
        map.set(menu.rpcName, menu);
      }
      return map;
    };

    return foldMenus(this.menuItems);
  }
}
