import { VuuServer } from "../../core/VuuServer";
import { RpcParams } from "./Rpc";
import {
  EmptyViewPortMenu,
  ViewPortMenu,
  ViewPortMenuFolder,
  ViewPortMenuItem,
} from "../../viewport/ViewPortMenu";

export type RpcHandlerFunc = (vuuServer: VuuServer) => RpcHandler;

export class RpcHandler {
  processViewPortRpcCall(methodName: string, rpcParams: RpcParams): unknown {
    return undefined;
  }
  get menuItems(): ViewPortMenu {
    return EmptyViewPortMenu;
  }

  get menuMap() {
    return this.menusAsMap();
  }

  private menusAsMap() {
    const foldMenus = (
      menu: ViewPortMenu,
      map = new Map<string, ViewPortMenuItem>()
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
