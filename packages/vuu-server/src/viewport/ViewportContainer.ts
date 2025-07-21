import { Table } from "@heswell/data";
import type {
  VuuCreateVisualLink,
  VuuLink,
  VuuLinkDescriptor,
  VuuTable,
  VuuViewportCreateRequest,
} from "@vuu-ui/vuu-protocol-types";
import { EventEmitter, uuid } from "@vuu-ui/vuu-utils";
import { ISession } from "../server-types";
import { RuntimeVisualLink } from "../RuntimeVisualLink";
import { Viewport } from "./Viewport";
import { ServiceFactory } from "../core/module/ModuleFactory";
import { TableContainer } from "../core/table/TableContainer";
import { ProviderContainer } from "../provider/ProviderContainer";
import { ViewPortDef } from "../api/ViewPortDef";

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

  #runtimeVisualLinks = new Map<string, RuntimeVisualLink>();
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
        `[ViewPortContainer] no viewPortDefFunc found for table ${table.schema.table.table}`
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

  closeViewport(viewportId: string) {
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

  closeViewportsForSession(sessionId: string) {
    console.log(`close all viewports for session ${sessionId}`);
  }

  handleRpcRequest(viewportId: string, rpcName: string, params: unknown[]) {
    console.log(`handleViewportRpcReqiest`);
    const viewport = this.getViewportById(viewportId);
    // return viewport.
  }

  createVisualLink({
    childColumnName,
    childVpId,
    parentColumnName,
    parentVpId,
  }: Omit<VuuCreateVisualLink, "type">) {
    const childViewport = this.#viewports.get(childVpId);
    const parentViewport = this.#viewports.get(parentVpId);
    if (childViewport && parentViewport) {
      const runtimeVisualLink = new RuntimeVisualLink(
        childViewport,
        parentViewport,
        childColumnName,
        parentColumnName
      );
      this.#runtimeVisualLinks.set(childVpId, runtimeVisualLink);
    } else {
      console.warn(`unable to create visual link, viewport not found`);
    }
  }

  removeVisualLink(childVpId: string) {
    const visualLink = this.#runtimeVisualLinks.get(childVpId);
    if (visualLink) {
      visualLink.remove();
      this.#runtimeVisualLinks.delete(childVpId);
    } else {
      throw Error("unable to remove visual link childVpId not found");
    }
  }

  getVisualLinks(viewportId: string, vuuLinks: VuuLink[]) {
    const viewport = this.getViewportById(viewportId);
    const otherViewportsForSession = this.getViewportsBySessionId(
      viewport.sessionId
    );
    const availableLinks: VuuLinkDescriptor[] = [];
    // TODO must be active (i.e. in same layout)
    for (const vp of otherViewportsForSession) {
      const link = getLinkToTable(vuuLinks, vp.table.schema.table.table);
      if (link) {
        availableLinks.push({ parentVpId: vp.id, link });
      }
    }

    return availableLinks;
  }

  private getViewportsBySessionId(sessionId: string) {
    return Array.from(this.#viewports.values()).filter(
      ({ sessionId: id }) => id === sessionId
    );
  }
}

const getLinkToTable = (vuuLinks: VuuLink[], tableName: string) => {
  return vuuLinks.find(({ toTable }) => toTable === tableName);
};
