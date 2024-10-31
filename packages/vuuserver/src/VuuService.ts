import { ServiceHandlers } from "@heswell/server-core/src/requestHandlers.js";
import {
  VuuCreateVisualLink,
  VuuRpcServiceRequest,
  VuuTableListRequest,
  VuuTableMetaRequest,
  VuuViewportChangeRequest,
  VuuViewportCreateRequest,
  VuuViewportVisualLinksRequest,
} from "@vuu-ui/vuu-protocol-types";
import ModuleService from "@heswell/vuu-module";
import "./modules/simul/SimulModule.ts";
import "./modules/test/TestModule.ts";

import type {
  ConfiguredService,
  ISession,
  ServerConfig,
  VuuRequestHandler,
} from "@heswell/server-types";
import {
  ClientToServerCloseTreeNode,
  ClientToServerOpenTreeNode,
  ClientToServerRemoveViewPort,
  ClientToServerSelection,
  ClientToServerViewPortRange,
  ServerToClientTableRows,
  VuuRow,
  VuuTable,
} from "@vuu-ui/vuu-protocol-types";
import {
  isGetUniqueValues,
  isGetUniqueValuesStartingWith,
} from "./request-utils.ts";
import ViewportContainer from "./ViewportContainer.ts";

const configure = async ({ service }: ServerConfig) => {};

const GET_TABLE_LIST: VuuRequestHandler<VuuTableListRequest> = (
  message,
  session
) => {
  // priority 1
  session.enqueue(message.requestId, {
    type: "TABLE_LIST_RESP",
    tables: ModuleService.getTablelist(),
  });
};

const GET_TABLE_META: VuuRequestHandler<VuuTableMetaRequest> = (
  message,
  session
) => {
  const schema = ModuleService.getTableSchema(message.body.table);
  // priority 1
  session.enqueue(message.requestId, {
    columns: schema.columns.map((col) => col.name),
    dataTypes: schema.columns.map((col) => col.serverDataType),
    key: schema.key,
    type: "TABLE_META_RESP",
    table: schema.table,
  });
};

const CREATE_VP: VuuRequestHandler<VuuViewportCreateRequest> = (
  message,
  session
) => {
  const { table: vuuTable } = message.body;
  const table = ModuleService.getTable(vuuTable);

  const viewport = ViewportContainer.createViewport(
    session.id,
    table,
    message.body
  );
  // why do we need this ?
  session.addViewport(viewport.id);

  session.enqueue(message.requestId, {
    ...message.body,
    // missing from protocol definition
    aggregations: [],
    table: table.name,
    type: "CREATE_VP_SUCCESS",
    viewPortId: viewport.id,
  });

  const { rows, size } = viewport.getDataForCurrentRange();
  console.log(`adter subscribe ${rows.length} rows, size=${size}`);
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

const REMOVE_VP: VuuRequestHandler<ClientToServerRemoveViewPort> = (
  message,
  session
) => {
  const { viewPortId } = message.body;

  ViewportContainer.closeViewport(viewPortId);

  session.enqueue(message.requestId, {
    type: "REMOVE_VP_SUCCESS",
    viewPortId,
  });
};

const CHANGE_VP: VuuRequestHandler<VuuViewportChangeRequest> = (
  message,
  session
) => {
  // should be purge the queue of any pending updates outside the requested range ?
  session.enqueue(message.requestId, {
    ...message.body,
    type: "CHANGE_VP_SUCCESS",
  });

  const { viewPortId } = message.body;
  const viewport = ViewportContainer.getViewport(viewPortId);
  if (viewport) {
    const dateResponse = viewport.changeViewport(message.body);
    if (dateResponse) {
      const { rows, size } = dateResponse;
      enqueueDataMessages(rows, size, session, viewPortId);
    }
  }
};

const CHANGE_VP_RANGE: VuuRequestHandler<ClientToServerViewPortRange> = (
  message,
  session
) => {
  const { from, to, viewPortId } = message.body;
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

const GET_VP_VISUAL_LINKS: VuuRequestHandler<VuuViewportVisualLinksRequest> = (
  message,
  session
) => {
  // Get the visualLinks from the viewportContainer
  const viewport = ViewportContainer.getViewport(message.body.vpId);
  const links = ModuleService.getLinks(viewport.table.schema.table);
  console.log(`get visual links ${viewport.table.name}`, {
    links,
  });
};

const CREATE_VISUAL_LINK: VuuRequestHandler<VuuCreateVisualLink> = (
  message,
  session
) => {
  console.log("create a visual link", {
    message,
  });
};

const RPC_CALL: VuuRequestHandler<VuuRpcServiceRequest> = (
  message,
  session
) => {
  console.log(
    `what do we do with an RPC call ${JSON.stringify(message, null, 2)}`
  );
  switch (message.body.service) {
    case "TypeAheadRpcHandler":
      {
        const { method } = message.body;

        const start = performance.now();
        const result = typeaheadService(message.body);
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

const SET_SELECTION: VuuRequestHandler<ClientToServerSelection> = (
  message,
  session
) => {
  const { selection, vpId } = message.body;
  const viewport = ViewportContainer.getViewport(vpId);
  const { rows, size } = viewport.select(selection);
  enqueueDataMessages(rows, size, session, vpId);
};

const OPEN_TREE_NODE: VuuRequestHandler<ClientToServerOpenTreeNode> = (
  message,
  session
) => {
  const { treeKey, vpId } = message.body;
  const viewport = ViewportContainer.getViewport(vpId);
  const { rows, size } = viewport.openTreeNode(treeKey);
  enqueueDataMessages(rows, size, session, vpId);
};

const CLOSE_TREE_NODE: VuuRequestHandler<ClientToServerCloseTreeNode> = (
  message,
  session
) => {
  const { treeKey, vpId } = message.body;
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
    const ts = +new Date();

    const messageBody: ServerToClientTableRows = {
      batch: "REQ-0",
      isLast: true,
      rows: [
        {
          data: [],
          rowIndex: -1,
          rowKey: "SIZE",
          sel: 0,
          ts,
          updateType: "SIZE",
          viewPortId,
          vpSize,
          vpVersion: "",
        } as VuuRow,
      ].concat(rows),
      timeStamp: ts,
      type: "TABLE_ROW",
    };

    session.enqueue("", messageBody);
  }
};

function getTableColumnValues(
  vuuTable: VuuTable,
  column: string,
  pattern?: string
) {
  const table = ModuleService.getTable(vuuTable);
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

const onSessionClosed: VuuRequestHandler = (_, session) => {
  ViewportContainer.closeViewportsForSession(session.id);
};

export const messageAPI: ServiceHandlers = {
  onSessionClosed,
  CHANGE_VP,
  CHANGE_VP_RANGE,
  CLOSE_TREE_NODE,
  CREATE_VP,
  REMOVE_VP,
  GET_TABLE_LIST,
  GET_TABLE_META,
  GET_VP_VISUAL_LINKS,
  OPEN_TREE_NODE,
  RPC_CALL,
  SET_SELECTION,
};

export const serviceAPI: ConfiguredService = {
  configure,
};
