import type {
  VuuDataRowDto,
  VuuMenu,
  VuuMenuContext,
  VuuMenuItem,
  VuuRowDataItemType,
} from "@vuu-ui/vuu-protocol-types";
import type { VuuUser } from "../core/auths/VuuUser";
import type { ClientSessionId } from "../net/ClientConnectionCreator";
import type { Viewport, ViewPortSelection } from "./Viewport";
import type { ViewPortAction } from "./ViewPortAction";

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

/**
 * The session a menu RPC was invoked in. It is a `ClientSessionId`, so it can
 * be passed wherever one is expected (e.g. `createSimpleSessionTable`), and
 * also carries the user, for permission checks, and the viewport.
 */
export interface MenuRpcSession extends ClientSessionId {
  requestId: string;
  user: VuuUser;
  viewport: Viewport;
}

export type MenuRpcResult = ViewPortAction | Promise<ViewPortAction>;

export abstract class ViewPortMenuItem implements ViewPortMenu {
  constructor(
    public name: string,
    public filter: string,
    public rpcName: string,
  ) {}
  abstract readonly context: VuuMenuContext;
  get asJson(): VuuMenuItem {
    return {
      context: this.context,
      filter: this.filter,
      name: this.name,
      rpcName: this.rpcName,
    };
  }
}

/**
 * Handler for a `selected-rows` menu item. `selection` is the viewport's
 * current server-side selection. `sessionId` is kept for backward
 * compatibility; `session` carries the full session context.
 */
export type SelectionMenuFunc = (
  selection: ViewPortSelection,
  sessionId: string,
  session: MenuRpcSession,
) => MenuRpcResult;

/** Handler for a `grid` (table) menu item. */
export type TableMenuFunc = (session: MenuRpcSession) => MenuRpcResult;

/**
 * Handler for a `row` menu item. `row` is the row as sent by the client
 * (Scala Vuu parity); re-read it from the table if it must be authoritative.
 */
export type RowMenuFunc = (
  rowKey: string,
  row: VuuDataRowDto,
  session: MenuRpcSession,
) => MenuRpcResult;

/** Handler for a `cell` menu item. `value` is as sent by the client. */
export type CellMenuFunc = (
  rowKey: string,
  field: string,
  value: VuuRowDataItemType,
  session: MenuRpcSession,
) => MenuRpcResult;

export class SelectionViewPortMenuItem extends ViewPortMenuItem {
  readonly context = "selected-rows";
  constructor(
    name: string,
    filter: string,
    public func: SelectionMenuFunc,
    rpcName: string,
  ) {
    super(name, filter, rpcName);
  }
}

export class TableViewPortMenuItem extends ViewPortMenuItem {
  readonly context = "grid";
  constructor(
    name: string,
    filter: string,
    public func: TableMenuFunc,
    rpcName: string,
  ) {
    super(name, filter, rpcName);
  }
}

export class RowViewPortMenuItem extends ViewPortMenuItem {
  readonly context = "row";
  constructor(
    name: string,
    filter: string,
    public func: RowMenuFunc,
    rpcName: string,
  ) {
    super(name, filter, rpcName);
  }
}

/**
 * A `cell` menu item. `field` restricts the item to one column; the default
 * `"*"` shows it on every column.
 */
export class CellViewPortMenuItem extends ViewPortMenuItem {
  readonly context = "cell";
  constructor(
    name: string,
    filter: string,
    public func: CellMenuFunc,
    rpcName: string,
    public field = "*",
  ) {
    super(name, filter, rpcName);
  }
  get asJson(): VuuMenuItem & { field: string } {
    return { ...super.asJson, field: this.field };
  }
}

/** The client message type that invokes a menu item of each context. */
export const MenuRpcTypeForContext = {
  "selected-rows": "VIEW_PORT_MENUS_SELECT_RPC",
  grid: "VIEW_PORT_MENU_TABLE_RPC",
  row: "VIEW_PORT_MENU_ROW_RPC",
  cell: "VIEW_PORT_MENU_CELL_RPC",
} as const satisfies Record<VuuMenuContext, string>;
