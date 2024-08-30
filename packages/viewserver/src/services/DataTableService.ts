import type {
  DataTableDefinition,
  ISession,
  ServerConfig,
  VuuRequestHandler,
} from "@heswell/server-types";
import {
  ClientToServerChangeViewPort,
  ClientToServerCreateViewPort,
  ClientToServerRpcRequest,
  ClientToServerSelection,
  ClientToServerTableList,
  ClientToServerTableMeta,
  ClientToServerViewPortRange,
  ServerToClientTableRows,
  VuuClientToServerMessage,
  VuuRow,
  VuuTable,
} from "@vuu-ui/vuu-protocol-types";
import { uuid } from "@vuu-ui/vuu-utils";
import { Subscription } from "./Subscription.js";
import { Table } from "./Table.js";
import {
  isGetUniqueValues,
  isGetUniqueValuesStartingWith,
} from "./request-utils.js";

type QueuedSubscription = {
  message: VuuClientToServerMessage<ClientToServerCreateViewPort>;
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

const asTableKey = ({ module, table }: VuuTable) => `${module}:${table}`;

async function createTable({ dataPath, ...config }: DataTableDefinition) {
  const table = new Table(config);
  _tables[table.name] = table;
  const { name } = table;

  if (dataPath) {
    await table.loadData(dataPath);
  }

  const qs = _queuedSubscriptions[name];
  if (qs) {
    console.log(`Table ${name} created and we have queued Subscription(s)}`);
    _queuedSubscriptions[name] = undefined;
    qs.forEach(({ message, session }) => {
      console.log(`Add Queued Subscription clientId:${message.sessionId}`);
      CREATE_VP(message, session);
    });
  }

  return table;
}

const tableNameToVuuTable = (tableName: string): VuuTable => {
  const [module, table] = tableName.split(":");
  return { module, table };
};

export const GET_TABLE_LIST: VuuRequestHandler<ClientToServerTableList> = (
  message,
  session
) => {
  const tables = getTableNames();
  // priority 1
  session.enqueue(message.requestId, {
    type: "TABLE_LIST_RESP",
    tables: tables.map(tableNameToVuuTable),
  });
};

export const GET_TABLE_META: VuuRequestHandler<ClientToServerTableMeta> = (
  message,
  session
) => {
  const table = getTable(message.body.table);
  // priority 1
  session.enqueue(message.requestId, {
    columns: table.columns.map((col) => col.name),
    dataTypes: table.columns.map((col) => col.serverDataType ?? "string"),
    key: table.primaryKey,
    type: "TABLE_META_RESP",
    table: message.body.table,
  });
};

export const CREATE_VP: VuuRequestHandler<ClientToServerCreateViewPort> = (
  message,
  session
) => {
  try {
    const { table: vuuTable } = message.body;
    const table = getTable(vuuTable);
    if (table.status === "ready") {
      const viewPortId = uuid();
      const subscription = new Subscription(
        table,
        viewPortId,
        message,
        session
      );
      _subscriptions[viewPortId] = subscription;
      session.enqueue(message.requestId, {
        ...message.body,
        // missing from protocol definition
        aggregations: [],
        table: table.schema.table.table,
        type: "CREATE_VP_SUCCESS",
        viewPortId,
      });

      if (subscription.view.status === "ready") {
        const { rows, size } = subscription.view.setRange(message.body.range);
        enqueueDataMessages(rows, size, session, viewPortId);
      }
    } else {
      const key = asTableKey(message.body.table);
      const queuedSubscription =
        _queuedSubscriptions[key] || (_queuedSubscriptions[key] = []);
      queuedSubscription.push({ message, session });
      console.log(
        `queued subscriptions for ${key} = ${queuedSubscription.length}`
      );
    }
  } catch (e) {
    throw Error(
      `[DataTableService] request for unknown table '${asTableKey(
        message.body.table
      )}', available tables are:\n${Object.keys(_tables)
        .map((tableName) => `\t* ${tableName}`)
        .join("\n")}`
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
  console.log(`size = ${size}`);

  enqueueDataMessages(rows, size, session, viewPortId);
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
  enqueueDataMessages(rows, size, session, viewPortId);
};

export const RPC_CALL: VuuRequestHandler<ClientToServerRpcRequest> = (
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

export const SET_SELECTION: VuuRequestHandler<ClientToServerSelection> = (
  message,
  session
) => {
  const { selection, vpId } = message.body;
  const subscription = _subscriptions[vpId];
  const { rows, size } = subscription.view.select(selection);
  enqueueDataMessages(rows, size, session, vpId);
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

// export function setGroupState(clientId, { viewport, groupState }, queue) {
//   _subscriptions[viewport].invoke('setGroupState', queue, DataType.Rowset, groupState);
// }

// export function InsertTableRow(clientId, request, queue) {
//   const tableHelper = getTable(request.tablename);
//   tableHelper.table.insert(request.row);
//   console.warn(`InsertTableRow TODO send confirmation ${queue.length}`);
// }

function getTable(table: VuuTable): Table {
  const key = asTableKey(table);
  if (_tables[key]) {
    return _tables[key];
  } else {
    throw Error(`DataTableService. no table definition for ${key}`);
  }
}

function getTableNames() {
  return Object.keys(_tables);
}

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
  const table = getTable(vuuTable);
  if (table) {
  } else {
    throw Error(
      `getTableColumnValues no table ${vuuTable.module}/${vuuTable.table}`
    );
  }

  return table.getUniqueValuesForColumn(column, pattern).slice(0, 10);
}

function typeaheadService(message: ClientToServerRpcRequest) {
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
