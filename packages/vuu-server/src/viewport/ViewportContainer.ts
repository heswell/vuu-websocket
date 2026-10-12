import type {
  RpcResult,
  VuuLinkDescriptor,
  VuuTable,
  VuuRowDataItemType,
  VuuRpcMenuRequest,
  VuuViewportCreateRequest,
} from "@vuu-ui/vuu-protocol-types";
import { EventEmitter, uuid } from "@vuu-ui/vuu-utils";
import {
  Viewport,
  ViewPortRange,
  ViewPortSelection,
  ViewPortUpdate,
  ViewPortVisualLink,
} from "./Viewport";
import { ServiceFactory } from "../core/module/ModuleFactory";
import { TableContainer } from "../core/table/TableContainer";
import { ProviderContainer } from "../provider/ProviderContainer";
import { ViewPortDef } from "../api/ViewPortDef";
import type { Column } from "../api/TableDef";
import { RpcParams } from "../net/rpc/Rpc";
import { DataTable, isDataTable } from "../core/table/InMemDataTable";
import {
  CellViewPortMenuItem,
  MenuRpcTypeForContext,
  RowViewPortMenuItem,
  SelectionViewPortMenuItem,
  TableViewPortMenuItem,
  type MenuRpcSession,
} from "./ViewPortMenu";
import type { ViewPortAction } from "./ViewPortAction";
import { RequestContext } from "../net/RequestProcessor";
import { VuuUser } from "../core/auths/VuuUser";
import { ClientSessionId } from "../net/ClientConnectionCreator";
import { PublishQueue } from "../util/PublishQueue";
import { ViewPortId } from "../client/messages/ClientMessage";
import { getLogger } from "@heswell/service-utils";

const log = getLogger("vuu.viewport");

export type ViewportCreationEvent = {
  id: string;
  table: VuuTable;
  type: "viewport-created";
};
export type ViewportRemovedEvent = {
  id: string;
  type: "viewport-removed";
};

export type ViewportEvents = {
  "viewport-created": (e: ViewportCreationEvent) => void;
  "viewport-removed": (e: ViewportRemovedEvent) => void;
};

/**
 * A menu RPC could not be dispatched (unknown viewport or rpcName, or a
 * context mismatch). Its message is safe to return to the client.
 */
export class MenuRpcDispatchError extends Error {
  name = "MenuRpcDispatchError";
}

export class ViewportContainer extends EventEmitter<ViewportEvents> {
  constructor(
    private tableContainer: TableContainer,
    private providerContainer: ProviderContainer,
  ) {
    super();
    log.debug("create ViewportContainer");
  }

  #sessionViewportMap = new Map<string, string[]>();
  #viewports = new Map<string, Viewport>();
  #viewPortDefinitions: Map<string, ServiceFactory> = new Map();

  addViewPortDefinition(tableName: string, viewPortDefFunc: ServiceFactory) {
    log.debug(`addViewPortDefinition ${tableName}`);
    this.#viewPortDefinitions.set(tableName, viewPortDefFunc);
  }

  /**
   * Creates a new ViewPortDef for a viewport on `table`, invoking the table's
   * ServiceFactory if one is registered. Called once per viewport (CREATE_VP);
   * see {@link ServiceFactory} for the lifecycle contract.
   */
  getViewPortDefinition(table: DataTable) {
    const viewPortDefFunc = this.getViewPortDefinitionCreator(table);
    if (viewPortDefFunc) {
      log.debug(
        `getViewPortDefinition ${table.name}, instantiate ViewPortDef`,
      );
      return viewPortDefFunc(
        table,
        table.provider,
        this.providerContainer,
        this.tableContainer,
      );
    } else {
      log.debug(
        `no viewPortDefFunc found for table ${table.schema.table.table}, returning default with columns only, no services`,
      );
      return ViewPortDef.default(table.tableDef.columns);
    }
  }

  /**
   * Columns reported in table metadata (GET_TABLE_META). Derived from the
   * TableDef so no ServiceFactory / RpcHandler is instantiated.
   */
  getTableMetaColumns(table: DataTable): Column[] {
    return table.tableDef.columns;
  }

  private getViewPortDefinitionCreator(table: DataTable) {
    return this.#viewPortDefinitions.get(table.tableDef.name);
  }

  get viewportCount() {
    return this.#viewports.size;
  }

  create(
    requestId: string,
    user: VuuUser,
    clientSessionId: ClientSessionId,
    outboundQueue: PublishQueue<ViewPortUpdate>,
    table: DataTable,
    {
      aggregations,
      columns,
      filterSpec,
      groupBy,
      range,
      sort,
    }: VuuViewportCreateRequest,
  ) {
    const { sessionId } = clientSessionId;
    const id = ViewPortId.oneNew();
    log.debug(`create vp ${id}, table ${table.name}`);
    const viewPortDef = this.getViewPortDefinition(table);
    const viewport = new Viewport(
      id,
      user,
      clientSessionId,
      outboundQueue,
      { columns, filterSpec, groupBy, sort },
      range,
      table,
      { aggregations, columns, filterSpec, groupBy, range, sort },
      viewPortDef,
    );

    viewport.requestId = requestId;

    const { permissionFunction } = table.tableDef;
    if (permissionFunction) {
      viewport.permissionFilter = permissionFunction(
        viewport,
        this.tableContainer,
      );
    }

    this.#viewports.set(id, viewport);
    const viewports = this.#sessionViewportMap.get(sessionId);
    if (viewports) {
      viewports.push(id);
    } else {
      this.#sessionViewportMap.set(sessionId, [id]);
    }
    this.emit("viewport-created", {
      id: viewport.id,
      table: table.schema.table,
      type: "viewport-created",
    });
    return viewport;
  }

  changeRange(
    clientSession: ClientSessionId,
    vpId: string,
    range: ViewPortRange,
  ) {
    // console.log(`[ViewPortContainer] change range ${range.from} - ${range.to}`);

    const viewport = this.getViewportById(vpId);
    if (viewport) {
      viewport.setRange(range);
    } else {
      throw Error(`[VuuProtocolHandler] no viewport for id #${vpId}`);
    }
  }

  getViewportById(viewportId: string) {
    const viewport = this.#viewports.get(viewportId);
    if (viewport) {
      return viewport;
    } else {
      throw Error(`[ViewportContainer] viewport not found ${viewport}`);
    }
  }

  removeViewport(viewportId: string) {
    const viewport = this.getViewportById(viewportId);
    // remove any visual links for which this viewport is the parent
    for (const vp of this.#viewports.values()) {
      if (vp.visualLink?.parentVp === viewport) {
        vp.removeVisualLink();
      }
    }
    viewport.destroy();
    this.#viewports.delete(viewportId);
    const viewports = this.#sessionViewportMap.get(viewport.sessionId);
    if (viewports && viewports.length > 0) {
      if (viewports.length === 1) {
        this.#sessionViewportMap.delete(viewport.sessionId);
      } else if (viewports.length > 1) {
        const idx = viewports.indexOf(viewportId);
        if (idx !== -1) {
          viewports.splice(idx, 1);
        }
      }
      this.emit("viewport-removed", {
        id: viewport.id,
        type: "viewport-removed",
      });
    } else {
      throw Error(
        `[ViewportContainer] closeViewport, viewportId ${viewportId} not found in sessionMap`,
      );
    }
  }

  removeForSession(clientSessionId: ClientSessionId) {
    log.debug(
      `close all viewports for session ${clientSessionId}`,
    );
    for (const viewPort of this.listViewportsForSession(
      clientSessionId.sessionId,
    )) {
      this.removeViewport(viewPort.id);
    }
  }

  disableViewport(viewportId: string, clientSessionId: ClientSessionId) {
    log.debug(`disableViewport ${viewportId}`);
    const viewport = this.getViewportById(viewportId);
    if (viewport.enabled) {
      viewport.enabled = false;
    } else {
      log.warn(
        `disableViewport, viewport ${viewportId} is already disabled`,
      );
    }
  }
  enableViewport(viewportId: string, clientSessionId: ClientSessionId) {
    log.debug(`enableViewport ${viewportId}`);
    const viewport = this.getViewportById(viewportId);
    if (!viewport.enabled) {
      viewport.enabled = true;
    } else {
      log.warn(
        `enableViewport, viewport ${viewportId} is already enabled`,
      );
    }
  }

  /**
   * Invokes the handler of the menu item `rpcName` on viewport `vpId`, as
   * requested by one of the four menu RPC messages. Throws a
   * {@link MenuRpcDispatchError} if the viewport does not exist or belongs to
   * another session, if the viewport's RpcHandler has no menu item
   * `rpcName`, or if the item's context does not match the message type.
   * Errors thrown by the handler itself propagate unchanged.
   */
  async callMenuRpc(
    request: VuuRpcMenuRequest,
    ctx: RequestContext,
  ): Promise<ViewPortAction> {
    const { rpcName, type, vpId } = request;
    const viewport = this.#viewports.get(vpId);
    if (viewport === undefined || viewport.sessionId !== ctx.session.sessionId) {
      throw new MenuRpcDispatchError(`viewport ${vpId} not found`);
    }
    const menuItem = viewport.viewPortDef.service.menuMap.get(rpcName);
    if (menuItem === undefined) {
      throw new MenuRpcDispatchError(
        `no menu item ${rpcName} on viewport ${vpId}`,
      );
    }
    if (MenuRpcTypeForContext[menuItem.context] !== type) {
      throw new MenuRpcDispatchError(
        `menu item ${rpcName} has context ${menuItem.context}, cannot be invoked by ${type}`,
      );
    }
    const session: MenuRpcSession = {
      channelId: ctx.session.channelId,
      requestId: ctx.requestId,
      sessionId: ctx.session.sessionId,
      user: ctx.user,
      viewport,
    };
    if (
      request.type === "VIEW_PORT_MENUS_SELECT_RPC" &&
      menuItem instanceof SelectionViewPortMenuItem
    ) {
      return menuItem.func(
        ViewPortSelection(viewport.selectedKeys, viewport),
        session.sessionId,
        session,
      );
    } else if (
      request.type === "VIEW_PORT_MENU_TABLE_RPC" &&
      menuItem instanceof TableViewPortMenuItem
    ) {
      return menuItem.func(session);
    } else if (
      request.type === "VIEW_PORT_MENU_ROW_RPC" &&
      menuItem instanceof RowViewPortMenuItem
    ) {
      return menuItem.func(request.rowKey, request.row ?? {}, session);
    } else if (
      request.type === "VIEW_PORT_MENU_CELL_RPC" &&
      menuItem instanceof CellViewPortMenuItem
    ) {
      return menuItem.func(
        request.rowKey,
        request.field,
        request.value as unknown as VuuRowDataItemType,
        session,
      );
    }
    throw new MenuRpcDispatchError(
      `menu item ${rpcName} cannot be invoked by ${type}`,
    );
  }

  handleRpcRequest(
    viewPortId: string,
    rpcName: string,
    params: Record<string, unknown>,
    ctx: RequestContext,
  ): RpcResult | Promise<RpcResult> {
    const viewport = this.getViewportById(viewPortId);
    return viewport.viewPortDef.service.processRpcRequest(
      rpcName,
      RpcParams(params, viewport, ctx),
    );
  }

  selectRow(
    clientSessionId: ClientSessionId,
    viewPortId: string,
    rowKey: string,
    preserveExistingSelection: boolean,
  ) {
    const viewport = this.getViewportById(viewPortId);

    const { selectedRowCount } = viewport.selectRow(
      rowKey,
      preserveExistingSelection,
    );

    return selectedRowCount;
  }

  deselectRow(
    clientSessionId: ClientSessionId,
    viewPortId: string,
    rowKey: string,
    preserveExistingSelection: boolean,
  ) {
    const viewport = this.getViewportById(viewPortId);
    const { selectedRowCount } = viewport.deselectRow(
      rowKey,
      preserveExistingSelection,
    );

    return selectedRowCount;
  }

  selectAll(viewPortId: string) {
    const viewport = this.getViewportById(viewPortId);
    const { selectedRowCount } = viewport.selectAll();
    return selectedRowCount;
  }

  deselectAll(viewPortId: string) {
    const viewport = this.getViewportById(viewPortId);
    const { selectedRowCount } = viewport.deselectAll();
    return selectedRowCount;
  }

  selectRowRange(
    viewPortId: string,
    fromRowKey: string,
    toRowKey: string,
    preserveExistingSelection: boolean,
  ) {
    const viewport = this.getViewportById(viewPortId);
    const { selectedRowCount } = viewport.selectRowRange(
      fromRowKey,
      toRowKey,
      preserveExistingSelection,
    );
    return selectedRowCount;
  }

  linkViewPorts(
    childVpId: string,
    parentVpId: string,
    childColumnName: string,
    parentColumnName: string,
  ) {
    log.debug(`link viewports ${childVpId} -> ${parentVpId}`);
    const child = this.getViewportById(childVpId);
    const parent = this.getViewportById(parentVpId);
    const childColumn = child.dataTable.columnForName(childColumnName);
    const parentColumn = parent.dataTable.columnForName(parentColumnName);
    child.setVisualLink(
      ViewPortVisualLink(child, parent, childColumn, parentColumn),
    );
  }

  openTreeNode(viewPortId: string, treeKey: string) {
    this.getViewportById(viewPortId).openTreeNode(treeKey);
  }

  closeTreeNode(viewPortId: string, treeKey: string) {
    this.getViewportById(viewPortId).closeTreeNode(treeKey);
  }

  unlinkViewPorts(childVpId: string) {
    const viewPort = this.getViewportById(childVpId);
    viewPort.removeVisualLink();
  }

  getViewPortVisualLinks(viewportId: string) {
    const viewport = this.getViewportById(viewportId);
    const { tableDef } = getViewPortDataTable(viewport);
    const visualLinks = tableDef.links;

    const otherViewportsForSession = this.listActiveViewportsForSession(
      viewport.sessionId,
    );

    const availableLinks: VuuLinkDescriptor[] = [];
    for (const vp of otherViewportsForSession) {
      if (vp !== viewport) {
        const {
          tableDef: { name },
        } = getViewPortDataTable(vp);
        const link = visualLinks.links.find(({ toTable }) => toTable === name);
        if (link) {
          availableLinks.push({ parentVpId: vp.id, link });
        }
      }
    }

    return availableLinks;
  }

  private listActiveViewportsForSession(sessionId: string) {
    // TODO must be active (i.e. in same layout)
    return this.listViewportsForSession(sessionId);
  }

  private listViewportsForSession(sessionId: string) {
    return Array.from(this.#viewports.values()).filter(
      ({ sessionId: id }) => id === sessionId,
    );
  }
}

const getViewPortDataTable = (vp: Viewport) => {
  if (isDataTable(vp.table)) {
    return vp.table as DataTable;
  } else {
    throw Error("[ViewPortContainer] viewport table is not a DataTable");
  }
};
