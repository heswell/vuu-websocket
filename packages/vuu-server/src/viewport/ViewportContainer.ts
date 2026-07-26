import { Table } from "@heswell/data";
import type {
  RpcResult,
  VuuLinkDescriptor,
  VuuTable,
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
import { RpcParams } from "../net/rpc/Rpc";
import { DataTable, isDataTable } from "../core/table/InMemDataTable";
import { SelectionViewPortMenuItem } from "./ViewPortMenu";
import { RequestContext } from "../net/RequestProcessor";
import { VuuUser } from "../core/auths/VuuUser";
import { ClientSessionId } from "../net/ClientConnectionCreator";
import { PublishQueue } from "../util/PublishQueue";
import { ViewPortId } from "../client/messages/ClientMessage";

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

export class ViewportContainer extends EventEmitter<ViewportEvents> {
  constructor(
    private tableContainer: TableContainer,
    private providerContainer: ProviderContainer,
  ) {
    super();
    console.log("create ViewportContainer");
  }

  #sessionViewportMap = new Map<string, string[]>();
  #viewports = new Map<string, Viewport>();
  #viewPortDefinitions: Map<string, ServiceFactory> = new Map();

  addViewPortDefinition(tableName: string, viewPortDefFunc: ServiceFactory) {
    console.log(`[ViewportContainer] addViewPortDefinition ${tableName}`);
    this.#viewPortDefinitions.set(tableName, viewPortDefFunc);
  }

  // Note: feels wrong that this gets calles on GET_TABLE_META request
  getViewPortDefinition(table: DataTable) {
    const viewPortDefFunc = this.getViewPortDefinitionCreator(table);
    if (viewPortDefFunc) {
      console.log(
        `[ViewportContainer] getViewPortDefinition ${table.name}, instantiate ViewPortDef`,
      );
      return viewPortDefFunc(
        table,
        table.provider,
        this.providerContainer,
        this.tableContainer,
      );
    } else {
      console.log(
        `[ViewPortContainer] no viewPortDefFunc found for table ${table.schema.table.table}, returning default with columns only, no services`,
      );
      return ViewPortDef.default(table.tableDef.columns);
    }
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
    { columns, filterSpec, groupBy, range, sort }: VuuViewportCreateRequest,
  ) {
    const { sessionId } = clientSessionId;
    const id = ViewPortId.oneNew();
    console.log(`[ViewportContainer] create vp ${id}, table ${table.name}`)
    const viewPortDef = this.getViewPortDefinition(table);
    const viewport = new Viewport(
      id,
      user,
      clientSessionId,
      outboundQueue,
      { columns, filterSpec, groupBy, sort },
      range,
      table,
      { columns, filterSpec, groupBy, range, sort },
      viewPortDef,
    );

    viewport.requestId = requestId;

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
    console.log(
      `[ViewportContainer] close all viewports for session ${clientSessionId}`,
    );
    for (const viewPort of this.listViewportsForSession(
      clientSessionId.sessionId,
    )) {
      this.removeViewport(viewPort.id);
    }
  }

  disableViewport(viewportId: string, clientSessionId: ClientSessionId) {
    console.log(`[ViewportContainer] disableViewport ${viewportId}`);
    const viewport = this.getViewportById(viewportId);
    if (viewport.enabled) {
      viewport.enabled = false;
    } else {
      console.warn(
        `[ViewportContainer] enableViewport, viewport ${viewportId} is already disabled`,
      );
    }
  }
  enableViewport(viewportId: string, clientSessionId: ClientSessionId) {
    console.log(`[ViewportContainer] enableViewport ${viewportId}`);
    const viewport = this.getViewportById(viewportId);
    if (!viewport.enabled) {
      viewport.enabled = true;
    } else {
      console.warn(
        `[ViewportContainer] enableViewport, viewport ${viewportId} is already enabled`,
      );
    }
  }

  callRpcSelection(vpId: string, rpcName: string, sessionId: string) {
    const viewport = this.getViewportById(vpId);
    const { menuMap } = viewport.viewPortDef.service;
    const menuItem = menuMap.get(rpcName);
    if (menuItem instanceof SelectionViewPortMenuItem) {
      return menuItem.func(
        ViewPortSelection(viewport.selectedKeys, viewport),
        sessionId,
      );
    } else {
      throw Error(
        `[ViewportContainer] callRpcSelection, no selection menuItem found for ${rpcName}`,
      );
    }
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
    console.log(`[ViewportContainer] link Viewports`);
    const child = this.getViewportById(childVpId);
    const parent = this.getViewportById(parentVpId);
    const childColumn = child.dataTable.columnForName(childColumnName);
    const parentColumn = parent.dataTable.columnForName(parentColumnName);
    child.setVisualLink(
      ViewPortVisualLink(child, parent, childColumn, parentColumn),
    );
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
