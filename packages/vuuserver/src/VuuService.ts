import { ServiceHandlers } from "@heswell/server-core/src/requestHandlers.js";
import {
  VuuClientMessage,
  VuuRpcServiceRequest,
  VuuTableListRequest,
  VuuTableMetaRequest,
  VuuViewportChangeRequest,
  VuuViewportCreateRequest,
  VuuViewportVisualLinksRequest,
} from "@vuu-ui/vuu-protocol-types";

import ModuleService from "@heswell/vuu-module";
import "./modules/simul/SimulModule.ts";

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
import { uuid } from "@vuu-ui/vuu-utils";
import {
  isGetUniqueValues,
  isGetUniqueValuesStartingWith,
} from "./request-utils.ts";
import { Subscription } from "./Subscription.ts";
import ViewportContainer from "./ViewportContainer.ts";

type QueuedSubscription = {
  message: VuuClientMessage<VuuViewportCreateRequest>;
  session: ISession;
};

const _subscriptions: Map<string, Subscription> = new Map();

const _queuedSubscriptions: {
  [tableName: string]: QueuedSubscription[] | undefined;
} = {};

const configure = async ({ service }: ServerConfig) => {};

const asTableKey = ({ module, table }: VuuTable) => `${module}:${table}`;

export const purgeSubscriptions: VuuRequestHandler = ({}, session) => {
  session.viewports.forEach((viewportId) => {
    const subscription = _subscriptions.get(viewportId);
    if (subscription) {
      subscription.clear();
      _subscriptions.delete(viewportId);
    }
  });
};

const GET_TABLE_LIST: VuuRequestHandler<VuuTableListRequest> = (
  message,
  session
) => {
  // priority 1
  console.log(`get table list fro module service`);
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
  try {
    const { table: vuuTable } = message.body;
    const table = ModuleService.getTable(vuuTable);
    const viewPortId = uuid();

    // vonst viewport = ViewportContainer.addViewport(session.id, viewportId, table, message)
    const subscription = new Subscription(table, viewPortId, message, session);

    _subscriptions.set(viewPortId, subscription);

    // why do we need this ?
    session.addViewport(viewPortId);

    console.log(`we have ${_subscriptions.size} subscriptions`);

    session.enqueue(message.requestId, {
      ...message.body,
      // missing from protocol definition
      aggregations: [],
      table: table.name,
      type: "CREATE_VP_SUCCESS",
      viewPortId,
    });

    const { rows, size } = subscription.view.getDataForCurrentRange();
    enqueueDataMessages(rows, size, session, viewPortId);
    // } else {
    //   const key = asTableKey(message.body.table);
    //   const queuedSubscription =
    //     _queuedSubscriptions[key] || (_queuedSubscriptions[key] = []);
    //   queuedSubscription.push({ message, session });
    //   console.log(
    //     `queued subscriptions for ${key} = ${queuedSubscription.length}`
    //   );
    // }
  } catch (e) {
    throw Error(
      `[DataTableService] request for unknown table '${asTableKey(
        message.body.table
      )}', available tables are:\n${[]
        .map((tableName) => `\t* ${tableName}`)
        .join("\n")}`
    );
  }
};

const REMOVE_VP: VuuRequestHandler<ClientToServerRemoveViewPort> = (
  message,
  session
) => {
  const { viewPortId } = message.body;
  // should be purge the queue of any pending updates outside the requested range ?

  const subscription = _subscriptions.get(viewPortId);
  if (subscription) {
    subscription.view.destroy();
    _subscriptions.delete(viewPortId);
  } else {
    throw Error(`unavle to remove Vp, subscription not found`);
  }

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
  const subscription = _subscriptions.get(viewPortId);
  if (subscription) {
    const dateResponse = subscription.view.changeViewport(message.body);
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
  const subscription = _subscriptions.get(viewPortId);
  if (subscription) {
    const { rows, size } = subscription.view.setRange({ from, to });
    enqueueDataMessages(rows, size, session, viewPortId);
  }
};

const GET_VP_VISUAL_LINKS: VuuRequestHandler<
  VuuViewportVisualLinksRequest
> = () => {};

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
  const subscription = _subscriptions.get(vpId);
  if (subscription) {
    const { rows, size } = subscription.view.select(selection);
    enqueueDataMessages(rows, size, session, vpId);
  }
};

const OPEN_TREE_NODE: VuuRequestHandler<ClientToServerOpenTreeNode> = (
  message,
  session
) => {
  const { treeKey, vpId } = message.body;
  const subscription = _subscriptions.get(vpId);
  if (subscription) {
    const { rows, size } = subscription.view.openTreeNode(treeKey);
    enqueueDataMessages(rows, size, session, vpId);
  }
};

const CLOSE_TREE_NODE: VuuRequestHandler<ClientToServerCloseTreeNode> = (
  message,
  session
) => {
  const { treeKey, vpId } = message.body;
  const subscription = _subscriptions.get(vpId);
  if (subscription) {
    const { rows, size } = subscription.view.closeTreeNode(treeKey);
    enqueueDataMessages(rows, size, session, vpId);
  }
};

// export function unsubscribeAll(sessionId: string, queue: MessageQueue) {

//   // const subscriptions = _clientSubscriptions[clientId];
//   // if (subscriptions && subscriptions.length) {
//   //   subscriptions.forEach((viewport) => {
//   //     const subscription = _subscriptions[viewport];
//   //     subscription.cancel();
//   //     delete _subscriptions[viewport];
//   //     queue.purgeViewport(viewport);
//   //   });
//   //   delete _clientSubscriptions[clientId];
//   // }
// }

// export function TerminateSubscription(clientId, request, queue) {
//   const { viewport } = request;
//   _subscriptions[viewport].cancel();
//   delete _subscriptions[viewport];
//   // purge any messages for this viewport from the messageQueue
//   _clientSubscriptions[clientId] = _clientSubscriptions[clientId].filter((vp) => vp !== viewport);
//   if (_clientSubscriptions[clientId].length === 0) {
//     delete _clientSubscriptions[clientId];
//   }
//   queue.purgeViewport(viewport);
// }

// // SuspendSubscription
// // ResumeSUbscription
// // TerminateAllSubscriptionsForClient

// export function ExpandGroup(clientId, request, queue) {
//   _subscriptions[request.viewport].update(request, queue);
// }

// export function CollapseGroup(clientId, request, queue) {
//   _subscriptions[request.viewport].update(request, queue);
// }

// export function setGroupState(clientId, { viewport, groupState }, queue) {
//   _subscriptions[viewport].invoke('setGroupState', queue, DataType.Rowset, groupState);
// }

// export function InsertTableRow(clientId, request, queue) {
//   const tableHelper = getTable(request.tablename);
//   tableHelper.table.insert(request.row);
//   console.warn(`InsertTableRow TODO send confirmation ${queue.length}`);
// }

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

export const messageAPI: ServiceHandlers = {
  purgeSubscriptions,
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
