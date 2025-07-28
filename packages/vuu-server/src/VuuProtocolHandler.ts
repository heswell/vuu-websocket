import {
  ClientToServerMenuSelectRPC,
  VuuCreateVisualLink,
  VuuRemoveVisualLink,
  VuuRpcEditCellRequest,
  VuuRpcServiceRequest,
  VuuRpcViewportRequest,
  VuuTableMetaRequest,
  VuuViewportChangeRequest,
  VuuViewportCreateRequest,
  VuuViewportMenusRequest,
  VuuViewportRangeRequest,
  VuuViewportRemoveRequest,
  VuuViewportVisualLinksRequest,
} from "@vuu-ui/vuu-protocol-types";
import logger from "./logger.ts";

import type { ISession, VuuProtocolHandler } from "./server-types";
import {
  ClientToServerCloseTreeNode,
  ClientToServerOpenTreeNode,
  ClientToServerSelection,
  VuuRow,
} from "@vuu-ui/vuu-protocol-types";
// import ViewportContainer from "./viewport/ViewportContainer.ts";
import { tableRowsMessageBody } from "@heswell/data";
// import ModuleContainer from "./core/module/ModuleContainer.ts";
// import tableContainer from "./core/table/TableContainer.ts";

const REMOVE_VP: VuuProtocolHandler = (message, session) => {
  const { viewPortId } = message.body as VuuViewportRemoveRequest;

  ViewportContainer.closeViewport(viewPortId);

  session.enqueue(message.requestId, {
    type: "REMOVE_VP_SUCCESS",
    viewPortId,
  });
};

const GET_VP_VISUAL_LINKS: VuuProtocolHandler = (message, session) => {
  const { vpId } = message.body as VuuViewportVisualLinksRequest;
  // Get the visualLinks from the viewportContainer
  console.log(JSON.stringify(message));
  const viewport = ViewportContainer.getViewportById(vpId);
  const vuuLinks = ModuleContainer.getLinks(viewport.table.schema.table);
  if (vuuLinks) {
    const links = ViewportContainer.getVisualLinks(vpId, vuuLinks);
    session.enqueue(message.requestId, {
      type: "VP_VISUAL_LINKS_RESP",
      links,
      vpId,
    });
  }
};

const CREATE_VISUAL_LINK: VuuProtocolHandler = (message, session) => {
  const { type, ...linkOptions } = message.body as VuuCreateVisualLink;
  ViewportContainer.createVisualLink(linkOptions);
  session.enqueue(message.requestId, {
    ...linkOptions,
    type: "CREATE_VISUAL_LINK_SUCCESS",
  });
};

const REMOVE_VISUAL_LINK: VuuProtocolHandler = (message, session) => {
  const { childVpId } = message.body as VuuRemoveVisualLink;
  ViewportContainer.removeVisualLink(childVpId);
  session.enqueue(message.requestId, {
    childVpId,
    type: "REMOVE_VISUAL_LINK_SUCCESS",
  });
};

const VIEW_PORT_MENUS_SELECT_RPC: VuuProtocolHandler = (message, session) => {
  const { vpId, rpcName } = message.body as ClientToServerMenuSelectRPC;
  if (rpcName === "VP_BULK_EDIT_BEGIN_RPC") {
    // we need the selected rows from the target viewport
    const viewport = ViewportContainer.getViewportById(vpId);
    const sessionTable =
      ModuleContainer.createSessionTableFromSelectedRows(viewport);

    session.enqueue(message.requestId, {
      action: {
        renderComponent: "grid",
        table: sessionTable,
        type: "OPEN_DIALOG_ACTION",
      },
      rpcName: "VP_BULK_EDIT_BEGIN_RPC",
      type: "VIEW_PORT_MENU_RESP",
      vpId,
    });
  }
};

const RPC_CALL: VuuProtocolHandler<VuuRpcServiceRequest> = (
  message,
  session
) => {
  const { body, module: moduleName } = message;
  const messageBody = body as VuuRpcServiceRequest;
  const { method, service } = messageBody;
  console.log(
    `[VuuProtocolHandler] RPC_CALL <${moduleName}> get handler for ${service} ${JSON.stringify(
      message,
      null,
      2
    )}`
  );
  const module = ModuleContainer.get(moduleName);

  const rpcHandler = module.rpcHandlerByService(service);
  // TODO should it be async ?
  const start = performance.now();
  const result = rpcHandler.handleRpcCall(messageBody) as string[];
  const end = performance.now();
  console.log(`typeaheadService took ${end - start}ms`);
  session.enqueue(message.requestId, {
    error: null,
    method,
    result,
    type: "RPC_RESP",
  });
};

const VIEW_PORT_RPC_CALL: VuuProtocolHandler = (message, session) => {
  const { namedParams, rpcName, vpId } = message.body as VuuRpcViewportRequest;
  const { table } = ViewportContainer.getViewportById(vpId);
  console.log(
    `VIEW_PORT_RPC_CALL rpcName ${rpcName} ${JSON.stringify(message)} table ${
      table.schema.table.table
    }`
  );

  switch (rpcName) {
    case "VP_BULK_EDIT_SUBMIT_RPC":
      {
        ModuleContainer.invokeService(table.schema.table, {
          name: rpcName,
          namedParams,
        });
        session.enqueue(message.requestId, {
          action: { type: "VP_RPC_SUCCESS" },
          type: "VIEW_PORT_RPC_REPONSE",
          rpcName,
          vpId,
        });
      }
      break;

    case "VP_BULK_EDIT_COLUMN_CELLS_RPC":
      {
        ModuleContainer.invokeService(table.schema.table, {
          name: rpcName,
          namedParams,
        });
        session.enqueue(message.requestId, {
          action: { type: "VP_RPC_SUCCESS" },
          type: "VIEW_PORT_RPC_REPONSE",
          rpcName,
          vpId,
        });
      }
      break;
    default:
      console.log(`unknown rpcName for VIEW_PORT_RPC_CALL ${rpcName}`);
  }
};

const VP_EDIT_CELL_RPC: VuuProtocolHandler = (message, session) => {
  const { field, rowKey, value, vpId } = message.body as VuuRpcEditCellRequest;
  const { table } = ViewportContainer.getViewportById(vpId);
  const rowIdx = table.rowIndexAtKey(rowKey);
  const colIdx = table.columnMap[field];
  // apply update, will enqueue update
  const result = table.update(rowIdx, [colIdx, value], true);

  // Note the type is inappropriate here, but its what the VuuServer sends
  session.enqueue(message.requestId, {
    action: {
      type: "VP_EDIT_SUCCESS",
    },
    rpcName: "VP_EDIT_CELL_RPC",
    type: "VIEW_PORT_MENU_RESP",
    vpId,
  });
};

const OPEN_TREE_NODE: VuuProtocolHandler = (message, session) => {
  const { treeKey, vpId } = message.body as ClientToServerOpenTreeNode;
  const viewport = ViewportContainer.getViewportById(vpId);
  const { rows, size } = viewport.openTreeNode(treeKey);
  enqueueDataMessages(rows, size, session, vpId);
};

const CLOSE_TREE_NODE: VuuProtocolHandler = (message, session) => {
  const { treeKey, vpId } = message.body as ClientToServerCloseTreeNode;
  const viewport = ViewportContainer.getViewportById(vpId);
  const { rows, size } = viewport.closeTreeNode(treeKey);
  enqueueDataMessages(rows, size, session, vpId);
};

const enqueueDataMessages = (
  rows: VuuRow[],
  vpSize: number,
  session: ISession,
  viewPortId: string,
  includeSize = false
) => {
  if (rows.length || includeSize) {
    session.enqueue(
      "",
      tableRowsMessageBody(rows, vpSize, viewPortId, includeSize)
    );
  }
};

const onSessionClosed: VuuProtocolHandler = (_, session) => {
  ViewportContainer.closeViewportsForSession(session.id);
};

type HandlerIdentifier = string;
export type ServiceHandlers<H extends VuuProtocolHandler = VuuProtocolHandler> =
  Record<HandlerIdentifier, H>;

export const messageAPI: ServiceHandlers<VuuProtocolHandler> = {
  onSessionClosed,
  CHANGE_VP,
  CHANGE_VP_RANGE,
  CLOSE_TREE_NODE,
  CREATE_VISUAL_LINK,
  CREATE_VP,
  GET_TABLE_LIST,
  GET_TABLE_META,
  GET_VIEW_PORT_MENUS,
  GET_VP_VISUAL_LINKS,
  OPEN_TREE_NODE,
  REMOVE_VISUAL_LINK,
  REMOVE_VP,
  RPC_CALL,
  SET_SELECTION,
  VIEW_PORT_MENUS_SELECT_RPC,
  VIEW_PORT_RPC_CALL,
  VP_EDIT_CELL_RPC,
};
