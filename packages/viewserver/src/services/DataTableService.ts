import { ColumnMetaData } from "@heswell/data";
import type {
  DataTableDefinition,
  ISession,
  ServerConfig,
  VuuRequestHandler,
} from "@heswell/server-types";
import {
  ClientToServerChangeViewPort,
  ClientToServerCreateViewPort,
  ClientToServerMessage,
  ClientToServerRpcCall,
  ClientToServerTableList,
  ClientToServerTableMeta,
  ClientToServerViewPortRange,
  ServerToClientTableRows,
} from "@vuu-ui/data-types";
import { uuid } from "@vuu-ui/vuu-utils";
import { Subscription } from "./Subscription.js";
import { Table } from "./Table.js";

type QueuedSubscription = {
  message: ClientToServerMessage<ClientToServerCreateViewPort>;
  session: ISession;
};

const _tables: { [key: string]: Table } = {};
var _subscriptions: { [viewportId: string]: Subscription } = {};
const _queuedSubscriptions: {
  [tableName: string]: QueuedSubscription[] | undefined;
} = {};

// need an API call to expose tables so extension services can manipulate data

export const configure = (props: ServerConfig): Promise<Table[]> => {
  const { DataTables } = props;
  return Promise.all(
    DataTables.map(async (config) => await createTable(config))
  );
};

async function createTable({ dataPath, ...config }: DataTableDefinition) {
  const { name: tablename } = config;
  const table = (_tables[tablename] = new Table(config));

  if (dataPath) {
    await table.loadData(dataPath);
  }

  const qs = _queuedSubscriptions[tablename];
  if (qs) {
    console.log(
      `Table ${tablename} created and we have queued Subscription(s)}`
    );
    _queuedSubscriptions[tablename] = undefined;
    qs.forEach(({ message, session }) => {
      console.log(`Add Queued Subscription clientId:${message.sessionId}`);
      CREATE_VP(message, session);
    });
  }

  return table;
}

export const GET_TABLE_LIST: VuuRequestHandler<ClientToServerTableList> = (
  message,
  session
) => {
  const tables = getTableNames();
  console.log(
    `received GET_TABLE_LIST request, requestId ${message.requestId} tables are ${tables}`
  );

  // priority 1
  session.enqueue(message.requestId, {
    type: "TABLE_LIST_RESP",
    tables: tables.map((table) => ({ table, module: "SIMUL" })),
  });
};

export const GET_TABLE_META: VuuRequestHandler<ClientToServerTableMeta> = (
  message,
  session
) => {
  const table = getTable(message.body.table.table);
  // priority 1
  session.enqueue(message.requestId, {
    columns: table.columns.map((col) => col.name),
    dataTypes: table.columns.map((col) => col.type ?? "string"),
    key: table.primaryKey,
    type: "TABLE_META_RESP",
    table: message.body.table,
  });
};

export const CREATE_VP: VuuRequestHandler<ClientToServerCreateViewPort> = (
  message,
  session
) => {
  const {
    table: { table: tableName },
  } = message.body;

  const table = _tables[tableName];
  if (table === undefined) {
    throw Error(
      `[DataTableService] request for unknown table '${tableName}', available tables are:\n${Object.keys(
        _tables
      )
        .map((tableName) => `\t* ${tableName}`)
        .join("\n")}`
    );
  }

  if (table.status === "ready") {
    const viewPortId = uuid();
    const subscription = new Subscription(table, viewPortId, message, session);
    _subscriptions[viewPortId] = subscription;

    session.enqueue(message.requestId, {
      ...message.body,
      // missing from protocol definition
      aggregations: [],
      table: tableName,
      type: "CREATE_VP_SUCCESS",
      viewPortId,
    });

    if (subscription.view.status === "ready") {
      const { rows, size } = subscription.view.setRange(message.body.range);
      enqueueDataMessages(
        rows,
        size,
        session,
        viewPortId,
        subscription.metaData
      );
    }
  } else {
    const queuedSubscription =
      _queuedSubscriptions[tableName] || (_queuedSubscriptions[tableName] = []);
    queuedSubscription.push({ message, session });
    console.log(
      `queued subscriptions for ${tableName} = ${queuedSubscription.length}`
    );
  }
};

export const CHANGE_VP: VuuRequestHandler<ClientToServerChangeViewPort> = (
  message,
  session
) => {
  // should be purge the queue of any pending updates outside the requested range ?
  session.enqueue(message.requestId, {
    ...message.body,
    type: "CHANGE_VP_SUCCESS",
  });

  const { viewPortId } = message.body;
  const subscription = _subscriptions[viewPortId];
  const { rows, size } = subscription.view.changeViewport(message.body);
  enqueueDataMessages(rows, size, session, viewPortId, subscription.metaData);
};

export const CHANGE_VP_RANGE: VuuRequestHandler<ClientToServerViewPortRange> = (
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
  const subscription = _subscriptions[viewPortId];
  const { rows, size } = subscription.view.setRange({ from, to });
  enqueueDataMessages(rows, size, session, viewPortId, subscription.metaData);
};

export const RPC_CALL: VuuRequestHandler<ClientToServerRpcCall> = (
  message,
  session
) => {
  console.log("what do we do with an RPC call");
  switch (message.body.service) {
    case "TypeAheadRpcHandler":
      console.log(`call to Typeahead service ${message.body.method}`);
      break;

    default:
      console.log(`unsupported RPC service ${message.body.service}`);
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

// export function ModifySubscription(clientId, request, queue) {
//   _subscriptions[request.viewport].update(request, queue);
// }

// export function ExpandGroup(clientId, request, queue) {
//   _subscriptions[request.viewport].update(request, queue);
// }

// export function CollapseGroup(clientId, request, queue) {
//   _subscriptions[request.viewport].update(request, queue);
// }

// export function filter(clientId, { viewport, filter, incremental, dataType }, queue) {
//   _subscriptions[viewport].invoke('filter', queue, dataType, filter, dataType, incremental);
// }

// export function select(
//   clientId,
//   { viewport, idx, rangeSelect, keepExistingSelection, dataType },
//   queue
// ) {
//   _subscriptions[viewport].invoke(
//     'select',
//     queue,
//     DataType.Selected,
//     idx,
//     rangeSelect,
//     keepExistingSelection,
//     dataType
//   );
// }

// export function selectAll(clientId, { viewport, dataType }, queue) {
//   _subscriptions[viewport].invoke('selectAll', queue, DataType.Selected, dataType);
// }

// export function selectNone(clientId, { viewport, dataType }, queue) {
//   _subscriptions[viewport].invoke('selectNone', queue, DataType.Selected, dataType);
// }

// export function groupBy(clientId, { viewport, groupBy }, queue) {
//   _subscriptions[viewport].invoke('groupBy', queue, DataType.Snapshot, groupBy);
// }

// export function setGroupState(clientId, { viewport, groupState }, queue) {
//   _subscriptions[viewport].invoke('setGroupState', queue, DataType.Rowset, groupState);
// }

// export function GetFilterData(clientId, { viewport, column, searchText, range }, queue) {
//   // TODO what about range ?
//   _subscriptions[viewport].invoke(
//     'getFilterData',
//     queue,
//     DataType.FilterData,
//     column,
//     searchText,
//     range
//   );
// }

// export function InsertTableRow(clientId, request, queue) {
//   const tableHelper = getTable(request.tablename);
//   tableHelper.table.insert(request.row);
//   console.warn(`InsertTableRow TODO send confirmation ${queue.length}`);
// }

function getTable(name: string): Table {
  if (_tables[name]) {
    return _tables[name];
  } else {
    throw Error(`DataTableService. no table definition for ${name}`);
  }
}

function getTableNames() {
  return Object.keys(_tables);
}

const enqueueDataMessages = (
  rows: any[],
  vpSize: number,
  session: ISession,
  viewPortId: string,
  { IDX, KEY }: ColumnMetaData
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
        },
      ],
      timeStamp: ts,
      type: "TABLE_ROW",
    };

    for (let row of rows) {
      const rowIndex = row[IDX];
      messageBody.rows.push({
        rowIndex,
        data: row.slice(0, IDX),
        rowKey: row[KEY],
        sel: 0,
        ts,
        updateType: "U",
        viewPortId,
        vpSize,
        vpVersion: "",
      });
    }

    session.enqueue("", messageBody);
  }
};
