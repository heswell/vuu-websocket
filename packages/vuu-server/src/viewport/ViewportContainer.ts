import { Table } from "@heswell/data";
import type {
  VuuCreateVisualLink,
  VuuLinkDescriptor,
  VuuTable,
  VuuViewportCreateRequest,
} from "@vuu-ui/vuu-protocol-types";
import { EventEmitter, uuid } from "@vuu-ui/vuu-utils";
import { ISession } from "../server-types";
import { RuntimeVisualLink } from "../RuntimeVisualLink";
import { Viewport, ViewPortSelection, ViewPortVisualLink } from "./Viewport";
import { ServiceFactory } from "../core/module/ModuleFactory";
import { TableContainer } from "../core/table/TableContainer";
import { ProviderContainer } from "../provider/ProviderContainer";
import { ViewPortDef } from "../api/ViewPortDef";
import { RpcParams } from "../net/rpc/Rpc";
import { DataTable, isDataTable } from "../core/table/InMemDataTable";
import { SelectionViewPortMenuItem } from "./ViewPortMenu";

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
    private providerContainer: ProviderContainer
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

  getViewPortDefinition(table: Table) {
    const viewPortDefFunc = this.getViewPortDefinitionCreator(table);
    if (viewPortDefFunc) {
      console.log(
        `[ViewportContainer] getViewPortDefinition this is where the ViewPortDef gets called, should create service`
      );
      return viewPortDefFunc(
        table,
        table.provider,
        this.providerContainer,
        this.tableContainer
      );
    } else {
      console.log(
        `[ViewPortContainer] no viewPortDefFunc found for table ${table.schema.table.table}, returning default with columns only, no services`
      );
      return ViewPortDef.default(table.tableDef.columns);
    }
  }

  private getViewPortDefinitionCreator(table: Table) {
    return this.#viewPortDefinitions.get(table.name);
  }

  get viewportCount() {
    return this.#viewports.size;
  }

  createViewport(
    session: ISession,
    table: Table,
    { columns, filterSpec, groupBy, range, sort }: VuuViewportCreateRequest
  ) {
    const id = uuid();
    const viewPortDef = this.getViewPortDefinition(table);
    const viewport = new Viewport(
      session,
      id,
      table,
      {
        columns,
        filterSpec,
        groupBy,
        range,
        sort,
      },
      viewPortDef
    );

    this.#viewports.set(id, viewport);
    const viewports = this.#sessionViewportMap.get(session.id);
    if (viewports) {
      viewports.push(id);
    } else {
      this.#sessionViewportMap.set(session.id, [id]);
    }
    this.emit("viewport-created", {
      id: viewport.id,
      table: table.schema.table,
      type: "viewport-created",
    });
    return viewport;
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
        `[ViewportContainer] closeViewport, viewportId ${viewportId} not found in sessionMap`
      );
    }
  }

  removeViewportsForSession(sessionId: string) {
    console.log(
      `[ViewportContainer] close all viewports for session ${sessionId}`
    );
    for (const viewPort of this.listViewportsForSession(sessionId)) {
      this.removeViewport(viewPort.id);
    }
  }

  callRpcSelection(vpId: string, rpcName: string, sessionId: string) {
    const viewport = this.getViewportById(vpId);
    const { menuMap } = viewport.viewPortDef.service;
    const menuItem = menuMap.get(rpcName);
    if (menuItem instanceof SelectionViewPortMenuItem) {
      return menuItem.func(
        ViewPortSelection(viewport.getSelection(), viewport),
        sessionId
      );
    } else {
      throw Error(
        `[ViewportContainer] callRpcSelection, no selection menuItem found for ${rpcName}`
      );
    }
  }

  handleRpcRequest(
    viewPortId: string,
    rpcName: string,
    params: Record<string, unknown>
  ) {
    const viewport = this.getViewportById(viewPortId);
    return viewport.viewPortDef.service.processViewPortRpcCall(
      rpcName,
      new RpcParams([], params, viewport.columns, viewport.keys)
    );
  }

  linkViewPorts(
    childVpId: string,
    parentVpId: string,
    childColumnName: string,
    parentColumnName: string
  ) {
    const child = this.getViewportById(childVpId);
    const parent = this.getViewportById(parentVpId);
    const childColumn = child.dataTable.columnForName(childColumnName);
    const parentColumn = parent.dataTable.columnForName(parentColumnName);
    child.setVisualLink(
      ViewPortVisualLink(child, parent, childColumn, parentColumn)
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
      viewport.sessionId
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
      ({ sessionId: id }) => id === sessionId
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
