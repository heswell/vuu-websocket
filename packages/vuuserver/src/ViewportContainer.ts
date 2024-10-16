import { Table } from "@heswell/data";
import type {
  VuuLink,
  VuuViewportCreateRequest,
} from "@vuu-ui/vuu-protocol-types";
import { uuid } from "@vuu-ui/vuu-utils";
import { DataView, type DataViewConfig } from "@heswell/data";

class Viewport extends DataView {
  #links?: VuuLink[];
  #sessionId: string;
  constructor(
    sessionId: string,
    id: string,
    table: Table,
    config: DataViewConfig
  ) {
    super(id, table, config);
    this.#sessionId = sessionId;
  }

  get sessionId() {
    return this.#sessionId;
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

  #sessionViewportMap = new Map<string, string[]>();
  #viewports = new Map<string, Viewport>();

  get viewportCount() {
    return this.#viewports.size;
  }

  createViewport(
    sessionId: string,
    table: Table,
    { columns, filterSpec, groupBy, range, sort }: VuuViewportCreateRequest
  ) {
    const id = uuid();
    console.log(`VPContainer add viewport`);
    const viewport = new Viewport(sessionId, id, table, {
      columns,
      filterSpec,
      groupBy,
      range,
      sort,
    });

    this.#viewports.set(id, viewport);
    const viewports = this.#sessionViewportMap.get(sessionId);
    if (viewports) {
      viewports.push(id);
    } else {
      this.#sessionViewportMap.set(sessionId, [id]);
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

  getVisualLinks(viewportId: string) {
    // get visual link definitions from the table
    // find potential link targets, must be ...
    // - same sessionId
    // - status active, that mesna in the active layout
  }
}

export default ViewportContainer.instance;
