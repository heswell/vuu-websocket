import { VuuDataRow, VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import logger from "../logger";
import { Table } from "@heswell/data";
import { TableSchema } from "@vuu-ui/vuu-data-types";

const refDataServiceUrl = `ws://localhost:${process.env.REFDATA_URL}`;

const orderStatus = ["NEW", "CANCELLED", "FILLED"];
const algos = ["DARKLIQ", "IS", "SURESHOT", "VWAP", "LITLIQ", "TWAP"];
const sides = ["BUY", "SELL"];
const accounts = [
  "Account 01",
  "Account 02",
  "Account 03",
  "Account 04",
  "Account 05",
  "Account 06",
  "Account 07",
  "Account 08",
  "Account 09",
  "Account 10",
  "Account 11",
  "Account 12",
  "Account 13",
  "Account 14",
  "Account 15",
  "Account 16",
  "Account 17",
  "Account 18",
  "Account 19",
  "Account 20",
];
const parentOrderCount = 10000;
const averageChildPerOrder = 5;
const childMaxMultiple = 10;

const instrumentsSchema: TableSchema = {
  columns: [
    { name: "bbg", serverDataType: "string" },
    { name: "currency", serverDataType: "string" },
    { name: "description", serverDataType: "string" },
    { name: "exchange", serverDataType: "string" },
    { name: "isin", serverDataType: "string" },
    { name: "lotSize", serverDataType: "int" },
    { name: "ric", serverDataType: "string" },
  ],
  key: "ric",
  table: {
    module: "ORDERS",
    table: "instruments",
  },
};

const parentOrdersSchema: TableSchema = {
  columns: [
    { name: "id", serverDataType: "string" },
    { name: "side", serverDataType: "string" },
    { name: "status", serverDataType: "string" },
    { name: "ric", serverDataType: "string" },
    { name: "algo", serverDataType: "string" },
    { name: "ccy", serverDataType: "string" },
    { name: "quantity", serverDataType: "double" },
    { name: "filledQuantity", serverDataType: "double" },
    { name: "account", serverDataType: "string" },
    { name: "trader", serverDataType: "string" },
    { name: "created", serverDataType: "long" },
    { name: "lastUpdated", serverDataType: "long" },
  ],
  key: "id",
  table: {
    module: "ORDERS",
    table: "parentOrders",
  },
};

const parentOrdersTable = new Table({
  schema: parentOrdersSchema,
});

let {
  promise: instrumentTablePromise,
  resolve: resolveInstrumentTable,
  reject,
} = Promise.withResolvers<Table>();

try {
  console.log(
    `[OrderWorker] open websocket to refdata on  ${refDataServiceUrl}`
  );

  // load instruments
  const instrumentsTable = new Table({
    schema: instrumentsSchema,
  });

  const socket = new WebSocket(refDataServiceUrl);

  socket.addEventListener("message", (evt) => {
    const message = JSON.parse(evt.data as string);
    if (message.count) {
      // all done
      console.log(`[OrderWorker] ${message.count} instruments loaded`);
      resolveInstrumentTable(instrumentsTable);
    } else {
      for (const instrument of message.instruments) {
        instrumentsTable.insert(instrument);
      }
    }
  });

  // socket opened
  socket.addEventListener("open", (event) => {
    console.log(
      `[OrderWorker] websocket client open, about to load instruments from refdata service`
    );
    socket.send(JSON.stringify({ type: "instruments" }));
  });
} catch (err) {
  console.log("Error sdfdfd");
}

function random(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const getRandom = <T = unknown>(list: T[]): T =>
  list[random(0, list.length - 1)];

async function createOrders() {
  console.log(`[OrderWorker] createOrders, wait until instruments loaded`);
  logger.info("[OrderWorker] load orders");
  const instrumentTable = await instrumentTablePromise;

  const {
    columnMap: { currency, exchange, ric },
    rows: instruments,
  } = instrumentTable;

  const columns = parentOrdersSchema.columns.map((col) => col.name);
  const colCount = columns.length;

  const row: Record<string, VuuRowDataItemType> = {};

  let count = 0;

  let parentOrderId = 0;

  for (let i = 0; i < parentOrderCount; i++) {
    parentOrderId += 1;

    const instrument = getRandom(instruments);
    const account = getRandom(accounts);
    const algo = getRandom(algos);
    const status = getRandom(orderStatus);
    const quantity = 1000 * random(1, 100);
    const filledQty =
      status === "FILLED"
        ? quantity
        : status === "NEW"
        ? 0
        : quantity - random(100, quantity);
    const openQty = quantity - filledQty;
    const side = getRandom(sides);

    const childCount = random(
      0,
      averageChildPerOrder * random(1, childMaxMultiple)
    );

    row.account = account;
    row.algo = algo;
    row.averagePrice = 0;
    row.ccy = instrument[currency];
    row.childCount = childCount;
    row.exchange = instrument[exchange];
    row.filledQty = filledQty;
    row.id = `${parentOrderId}`;
    row.idAsInt = parentOrderId;
    row.lastUpdate = "";
    row.openQty = openQty;
    row.price = 0;
    row.quantity = quantity;
    row.ric = instrument[ric];
    row.side = side;
    row.status = status;
    row.volLimit = 100;

    const dataRow: VuuDataRow = Array(colCount);
    // export data in same order that columns are specified in schema
    for (let i = 0; i < colCount; i++) {
      dataRow[i] = row[columns[i]];
    }
    postMessage({ parentOrder: dataRow });
    count += 1;
  }

  postMessage({ count });
  console.timeEnd("generate orders");
  logger.info(`${count} orders created`);
}

self.onmessage = (evt: MessageEvent) => {
  const { type } = JSON.parse(evt.data);
  if (type === "create-orders") {
    console.log(`[OrderWorker] message received from client ${type}`);
    createOrders();
  }
};
