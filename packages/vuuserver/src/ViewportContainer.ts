import { Table, tableRowsMessageBody } from "@heswell/data";
import type {
  ServerMessageBody,
  VuuCreateVisualLink,
  VuuLink,
  VuuLinkDescriptor,
  VuuRow,
  VuuViewportCreateRequest,
} from "@vuu-ui/vuu-protocol-types";
import { uuid } from "@vuu-ui/vuu-utils";
import { DataView, type DataViewConfig } from "@heswell/data";
import { ISession } from "@heswell/server-types";
import { RuntimeVisualLink } from "./RuntimeVisualLink";

export class Viewport extends DataView {
  #links?: VuuLink[];
  #session: ISession;
  constructor(
    session: ISession,
    id: string,
    table: Table,
    config: DataViewConfig
  ) {
    super(id, table, config);
    this.#session = session;
  }

  get sessionId() {
    return this.#session.id;
  }

  select(selection: number[]) {
    const response = super.select(selection);
    setTimeout(() => {
      this.emit("row-selection");
    }, 0);
    return response;
  }

  protected enqueue(messageBody: ServerMessageBody) {
    this.#session.enqueue("NA", messageBody);
  }

  enqueueDataMessages(rows: VuuRow[], vpSize: number) {
    if (rows.length) {
      this.#session.enqueue("", tableRowsMessageBody(rows, vpSize, this.id));
    }
  }
}

export class ViewportContainer {
  static #instance: ViewportContainer;
  public static get instance(): ViewportContainer {
    if (!ViewportContainer.#instance) {
      ViewportContainer.#instance = new ViewportContainer();
    }
    return ViewportContainer.#instance;
  }
  private constructor() {
    console.log("create ViewportContainer");
  }

  #runtimeVisualLinks = new Map<string, RuntimeVisualLink>();
  #sessionViewportMap = new Map<string, string[]>();
  #viewports = new Map<string, Viewport>();

  get viewportCount() {
    return this.#viewports.size;
  }

  createViewport(
    session: ISession,
    table: Table,
    { columns, filterSpec, groupBy, range, sort }: VuuViewportCreateRequest
  ) {
    const id = uuid();
    const viewport = new Viewport(session, id, table, {
      columns,
      filterSpec,
      groupBy,
      range,
      sort,
    });

    this.#viewports.set(id, viewport);
    const viewports = this.#sessionViewportMap.get(session.id);
    if (viewports) {
      viewports.push(id);
    } else {
      this.#sessionViewportMap.set(session.id, [id]);
    }
    return viewport;
  }

  getViewport(viewportId: string) {
    const viewport = this.#viewports.get(viewportId);
    if (viewport) {
      return viewport;
    } else {
      throw Error(`[ViewportContainer] viewport not found ${viewport}`);
    }
  }

  closeViewport(viewportId: string) {
    const viewport = this.getViewport(viewportId);
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
    } else {
      throw Error(
        `[ViewportContainer] closeViewport, viewportId ${viewportId} not found in sessionMap`
      );
    }
  }

  closeViewportsForSession(sessionId: string) {
    console.log(`close all viewports for session ${sessionId}`);
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
    const viewport = this.getViewport(viewportId);
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

export default ViewportContainer.instance;

const getLinkToTable = (vuuLinks: VuuLink[], tableName: string) => {
  return vuuLinks.find(({ toTable }) => toTable === tableName);
};
