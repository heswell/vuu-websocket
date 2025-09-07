import { VuuMenu, VuuMenuItem } from "@vuu-ui/vuu-protocol-types";
import { ViewPortSelection } from "./Viewport";
import { ViewPortAction } from "./ViewPortAction";

export interface ViewPortMenu {
  asJson: VuuMenu | VuuMenuItem;
}

export class EmptyViewPortMenu implements ViewPortMenu {
  get asJson() {
    return {
      name: "ROOT",
      menus: [],
    };
  }
}

export class ViewPortMenuFolder implements ViewPortMenu {
  constructor(public name: string, public menus: ViewPortMenu[]) {}
  get asJson() {
    return {
      name: this.name,
      menus: this.menus.map((menu) => menu.asJson),
    };
  }
}

export function ViewPortMenu(
  name: string,
  ...menus: ViewPortMenu[]
): ViewPortMenu;
export function ViewPortMenu(...menus: ViewPortMenu[]): ViewPortMenu;
export function ViewPortMenu(
  nameOrMenu: string | ViewPortMenu,
  ...menus: ViewPortMenu[]
): ViewPortMenu {
  if (typeof nameOrMenu !== "string") {
    return new ViewPortMenuFolder("ROOT", [nameOrMenu].concat(menus));
  } else {
    return new ViewPortMenuFolder(nameOrMenu, menus);
  }
}

export abstract class ViewPortMenuItem implements ViewPortMenu {
  constructor(
    public name: string,
    public filter: string,
    public rpcName: string
  ) {}
  abstract asJson: VuuMenuItem;
}

export type SelectionMenuFunc = (
  selection: ViewPortSelection,
  sessionId: string
) => ViewPortAction;

export class SelectionViewPortMenuItem extends ViewPortMenuItem {
  public func: SelectionMenuFunc;
  constructor(
    name: string,
    filter: string,
    func: SelectionMenuFunc,
    rpcName: string
  ) {
    super(name, filter, rpcName);
    this.func = func;
  }
  get asJson(): VuuMenuItem {
    return {
      context: "selected-rows",
      filter: this.filter,
      name: this.name,
      rpcName: this.rpcName,
    };
  }
}

export class CellViewPortMenuItem extends ViewPortMenuItem {
  constructor(name: string, filter: string, rpcName: string) {
    super(name, filter, rpcName);
  }
  get asJson(): VuuMenuItem {
    return {
      context: "cell",
      filter: this.filter,
      name: this.name,
      rpcName: this.rpcName,
    };
  }
}

export class TableViewPortMenuItem extends ViewPortMenuItem {
  constructor(name: string, filter: string, rpcName: string) {
    super(name, filter, rpcName);
  }
  get asJson(): VuuMenuItem {
    return {
      context: "grid",
      filter: this.filter,
      name: this.name,
      rpcName: this.rpcName,
    };
  }
}

export class RowViewPortMenuItem extends ViewPortMenuItem {
  constructor(name: string, filter: string, rpcName: string) {
    super(name, filter, rpcName);
  }
  get asJson(): VuuMenuItem {
    return {
      context: "row",
      filter: this.filter,
      name: this.name,
      rpcName: this.rpcName,
    };
  }
}
