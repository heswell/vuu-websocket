import { ServiceHandlers } from "@heswell/server-core";
import {
  ClientToServerMenuSelectRPC,
  VuuCreateVisualLink,
  VuuRemoveVisualLink,
  VuuRpcEditCellRequest,
  VuuRpcServiceRequest,
  VuuRpcViewportRequest,
  VuuTableListRequest,
  VuuTableMetaRequest,
  VuuViewportChangeRequest,
  VuuViewportCreateRequest,
  VuuViewportMenusRequest,
  VuuViewportRangeRequest,
  VuuViewportRemoveRequest,
  VuuViewportVisualLinksRequest,
} from "@vuu-ui/vuu-protocol-types";
import ModuleContainer from "@heswell/vuu-module";
import "./modules/simul/SimulModule.ts";
import "./modules/test/TestModule.ts";

import type {
  ConfiguredService,
  ISession,
  ServerConfig,
  VuuProtocolHandler,
} from "@heswell/server-types";
import {
  ClientToServerCloseTreeNode,
  ClientToServerOpenTreeNode,
  ClientToServerSelection,
  VuuRow,
  VuuTable,
} from "@vuu-ui/vuu-protocol-types";
import {
  isGetUniqueValues,
  isGetUniqueValuesStartingWith,
} from "./request-utils.ts";
import ViewportContainer from "./ViewportContainer.ts";
import { tableRowsMessageBody } from "@heswell/data";

const configure = async ({ service }: ServerConfig) => {};

const GET_TABLE_LIST: VuuProtocolHandler = (message, session) => {
  session.enqueue(message.requestId, {
    type: "TABLE_LIST_RESP",
    tables: ModuleContainer.tableList,
  });
};

const GET_TABLE_META: VuuProtocolHandler = (message, session) => {
  const { table } = message.body as VuuTableMetaRequest;
  const schema = ModuleContainer.getTableSchema(table);
  session.enqueue(message.requestId, {
    columns: schema.columns.map((col) => col.name),
    dataTypes: schema.columns.map((col) => col.serverDataType),
    key: schema.key,
    type: "TABLE_META_RESP",
    table: schema.table,
  });
};

const CREATE_VP: VuuProtocolHandler = (message, session) => {
  const body = message.body as VuuViewportCreateRequest;
  const { table: vuuTable } = body;
  const table = ModuleContainer.getTable(vuuTable);

  const viewport = ViewportContainer.createViewport(session, table, body);
  // why do we need this ?
  session.addViewport(viewport.id);

  session.enqueue(message.requestId, {
    ...body,
    table: table.name,
    type: "CREATE_VP_SUCCESS",
    viewPortId: viewport.id,
  });

  const { rows, size } = viewport.getDataForCurrentRange();
  enqueueDataMessages(rows, size, session, viewport.id);
  // } else {
  //   const key = asTableKey(message.body.table);
  //   const queuedSubscription =
  //     _queuedSubscriptions[key] || (_queuedSubscriptions[key] = []);
  //   queuedSubscription.push({ message, session });
  //   console.log(
  //     `queued subscriptions for ${key} = ${queuedSubscription.length}`
  //   );
  // }
};

const REMOVE_VP: VuuProtocolHandler = (message, session) => {
  const { viewPortId } = message.body as VuuViewportRemoveRequest;

  ViewportContainer.closeViewport(viewPortId);

  session.enqueue(message.requestId, {
    type: "REMOVE_VP_SUCCESS",
    viewPortId,
  });
};

const CHANGE_VP: VuuProtocolHandler = (message, session) => {
  // should be purge the queue of any pending updates outside the requested range ?
  const body = message.body as VuuViewportChangeRequest;

  session.enqueue(message.requestId, {
    ...body,
    type: "CHANGE_VP_SUCCESS",
  });

  const { viewPortId } = body;
  const viewport = ViewportContainer.getViewport(viewPortId);
  if (viewport) {
    const dataResponse = viewport.changeViewport(body);
    if (dataResponse) {
      const { rows, size } = dataResponse;
      enqueueDataMessages(rows, size, session, viewPortId);
    }
  }
};

const CHANGE_VP_RANGE: VuuProtocolHandler = (message, session) => {
  const { from, to, viewPortId } = message.body as VuuViewportRangeRequest;
  // should be purge the queue of any pending updates outside the requested range ?
  session.enqueue(message.requestId, {
    from,
    to,
    type: "CHANGE_VP_RANGE_SUCCESS",
    viewPortId,
  });

  const now = new Date().getTime();
  console.log(`[${now}] DataTableService: setRange ${from} - ${to}`);
  const viewport = ViewportContainer.getViewport(viewPortId);
  if (viewport) {
    const { rows, size } = viewport.setRange({ from, to });
    enqueueDataMessages(rows, size, session, viewPortId);
  }
};

const GET_VP_VISUAL_LINKS: VuuProtocolHandler = (message, session) => {
  const { vpId } = message.body as VuuViewportVisualLinksRequest;
  // Get the visualLinks from the viewportContainer
  console.log(JSON.stringify(message));
  const viewport = ViewportContainer.getViewport(vpId);
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

const GET_VIEW_PORT_MENUS: VuuProtocolHandler = (message, session) => {
  const { vpId } = message.body as VuuViewportMenusRequest;
  const viewport = ViewportContainer.getViewport(vpId);
  const menu = ModuleContainer.getMenu(viewport.table.schema.table);

  if (menu) {
    session.enqueue(message.requestId, {
      type: "VIEW_PORT_MENUS_RESP",
      menu,
      vpId,
    });
  }
};

const VIEW_PORT_MENUS_SELECT_RPC: VuuProtocolHandler = (message, session) => {
  const { vpId, rpcName } = message.body as ClientToServerMenuSelectRPC;
  if (rpcName === "VP_BULK_EDIT_BEGIN_RPC") {
    // we need the selected rows from the target viewport
    const viewport = ViewportContainer.getViewport(vpId);
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

const RPC_CALL: VuuProtocolHandler = (message, session) => {
  const messageBody = message.body as VuuRpcServiceRequest;
  const { method, service } = messageBody;
  switch (service) {
    case "TypeAheadRpcHandler":
      {
        const start = performance.now();
        const result = typeaheadService(messageBody);
        const end = performance.now();
        console.log(`typeaheadService took ${end - start}ms`);

        session.enqueue(message.requestId, {
          method,
          result,
          type: "RPC_RESP",
        });
      }
      break;

    default:
      console.log(`unsupported RPC service `);
  }
};

const VIEW_PORT_RPC_CALL: VuuProtocolHandler = (message, session) => {
  const { namedParams, rpcName, vpId } = message.body as VuuRpcViewportRequest;
  const { table } = ViewportContainer.getViewport(vpId);
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
  const { table } = ViewportContainer.getViewport(vpId);
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

const SET_SELECTION: VuuProtocolHandler = (message, session) => {
  const { selection, vpId } = message.body as ClientToServerSelection;
  const viewport = ViewportContainer.getViewport(vpId);
  const { rows, size } = viewport.select(selection);
  enqueueDataMessages(rows, size, session, vpId);
};

const OPEN_TREE_NODE: VuuProtocolHandler = (message, session) => {
  const { treeKey, vpId } = message.body as ClientToServerOpenTreeNode;
  const viewport = ViewportContainer.getViewport(vpId);
  const { rows, size } = viewport.openTreeNode(treeKey);
  enqueueDataMessages(rows, size, session, vpId);
};

const CLOSE_TREE_NODE: VuuProtocolHandler = (message, session) => {
  const { treeKey, vpId } = message.body as ClientToServerCloseTreeNode;
  const viewport = ViewportContainer.getViewport(vpId);
  const { rows, size } = viewport.closeTreeNode(treeKey);
  enqueueDataMessages(rows, size, session, vpId);
};

const enqueueDataMessages = (
  rows: VuuRow[],
  vpSize: number,
  session: ISession,
  viewPortId: string
) => {
  if (rows.length) {
    session.enqueue("", tableRowsMessageBody(rows, vpSize, viewPortId));
  }
};

function getTableColumnValues(
  vuuTable: VuuTable,
  column: string,
  pattern?: string
) {
  const table = ModuleContainer.getTable(vuuTable);
  return table.getUniqueValuesForColumn(column, pattern).slice(0, 10);
}

function typeaheadService(message: VuuRpcServiceRequest) {
  if (isGetUniqueValues(message)) {
    const [table, column] = message.params;
    return getTableColumnValues(table, column);
  } else if (isGetUniqueValuesStartingWith(message)) {
    const [table, column, pattern] = message.params;
    return getTableColumnValues(table, column, pattern);
  } else {
    throw Error(
      `Invalid message for typeahead service ${JSON.stringify(message)}`
    );
  }
}

const onSessionClosed: VuuProtocolHandler = (_, session) => {
  ViewportContainer.closeViewportsForSession(session.id);
};

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

export const serviceAPI: ConfiguredService = {
  configure,
};
