import OrderStore from "./OrderStore";
import logger from "../logger";
import { ParentOrder } from "./ParentOrder";
import { ParentOrderDto } from "./order-service-types";
import Clock, { accurateTimer } from "./Clock";

let parentOrderId = 0;
let lastTime = Clock.baseTime;
let lastOrderId = "";

const initialParentOrderCount = 10_000;
// const initialParentOrderCount = 10;
// const averageChildPerOrder = 5;
// const childMaxMultiple = 10;

function random(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const getRandom = <T = unknown>(list: T[]): T =>
  list[random(0, list.length - 1)];

const orderStatus = ["NEW", "CANCELLED", "PARTIAL", "FILLED"];
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

// The OrderStore is ready when instruments are loaded
await OrderStore.ready;

const {
  columnMap: { currency, ric },
  rows: instruments,
} = OrderStore.instrumentsTable;

let count = 0;
let ordersPerSecondCount = 0;

function createOrder(
  created = lastTime,
  status = getRandom(orderStatus) as ParentOrderDto["status"]
) {
  const id = `${parentOrderId++}`;
  const side = getRandom(sides);
  const algo = getRandom(algos);
  const quantity = 1000 * random(1, 100);
  const filledQty =
    status === "FILLED"
      ? quantity
      : status === "NEW"
      ? 0
      : quantity - random(100, quantity);
  const account = getRandom(accounts);
  const trader = "trader joe";
  const lastUpdated = created;
  const column13 = 0;
  const column14 = 0;
  const column15 = 0;
  const column16 = 0;
  const column17 = 0;
  const column18 = 0;
  const column19 = 0;
  const column20 = 0;
  const column21 = 0;
  const column22 = 0;
  const column23 = 0;
  const column24 = 0;
  const column25 = 0;
  const column26 = 0;
  const column27 = 0;
  const column28 = 0;
  const column29 = 0;
  const column30 = 0;
  const column31 = 0;
  const column32 = 0;
  const column33 = 0;
  const column34 = 0;
  const column35 = 0;
  const column36 = 0;
  const column37 = 0;
  const column38 = 0;
  const column39 = 0;
  const column40 = 0;

  const instrument = getRandom(instruments);

  count += 1;

  return new ParentOrder(
    id,
    side,
    status,
    instrument[ric],
    algo,
    instrument[currency],
    quantity,
    filledQty,
    account,
    trader,
    created,
    lastUpdated,
    column13,
    column14,
    column15,
    column16,
    column17,
    column18,
    column19,
    column20,
    column21,
    column22,
    column23,
    column24,
    column25,
    column26,
    column27,
    column28,
    column29,
    column30,
    column31,
    column32,
    column33,
    column34,
    column35,
    column36,
    column37,
    column38,
    column39,
    column40
  );
}

function createInitialOrders() {
  const start = performance.now();
  const created = Date.now();

  for (let i = 0; i < initialParentOrderCount; i++) {
    OrderStore.addParentOrder(createOrder(created));
    lastTime += 10;
  }

  const end = performance.now();
  console.log(
    `[ORDERS:service:order-factory] took ${
      end - start
    }ms to create ${count} orders`
  );
}

const MAX_ORDERS = 500_000;

const NewOrderCreationParams = {
  ORDERS_PER_BATCH: 2,
  NEW_ORDER_LOOP_INTERVAL: 1000,
};

let newOrderCreationRunning = false;
let currentNewOrderTimer: number | Timer | null = null;

function createNewOrders() {
  // TODO can we have sub-ms times ?
  // const time = Clock.currentTime;
  const created = Date.now();

  const { NEW_ORDER_LOOP_INTERVAL, ORDERS_PER_BATCH } = NewOrderCreationParams;

  console.log(
    `[ORDERS:service:order-factory] per loop  (${NEW_ORDER_LOOP_INTERVAL}ms) create ${ORDERS_PER_BATCH} new orders)`
  );

  for (let i = 0; i < ORDERS_PER_BATCH && count <= MAX_ORDERS; i++) {
    OrderStore.addParentOrder(createOrder(created, "NEW"), true);
  }
  ordersPerSecondCount += ORDERS_PER_BATCH;
  lastOrderId = "";

  if (count <= MAX_ORDERS && newOrderCreationRunning) {
    currentNewOrderTimer = setTimeout(createNewOrders, NEW_ORDER_LOOP_INTERVAL);
  }
}

function logOrderCreationRate() {
  if (ordersPerSecondCount > 0) {
    console.log(
      `generated ${ordersPerSecondCount} orders / second, last id: ${`${parentOrderId}`}`
    );
  }
  ordersPerSecondCount = 0;
}

createInitialOrders();
startNewOrderCreation({ newOrdersPerSecond: 5 });

export function startNewOrderCreation({
  newOrdersPerSecond = 1,
}: {
  newOrdersPerSecond?: number;
}) {
  logger.info(`[ORDERS:service:order-factory] START new order creation`);
  console.log(`[ORDERS:service:order-factory] START new order creation`);
  newOrderCreationRunning = true;

  const { newOrderInterval, newOrdersPerBatch } =
    calculateOrderFrequency(newOrdersPerSecond);

  NewOrderCreationParams.NEW_ORDER_LOOP_INTERVAL = newOrderInterval;
  NewOrderCreationParams.ORDERS_PER_BATCH = newOrdersPerBatch;

  createNewOrders();
}

export function stopNewOrderCreation() {
  logger.info(`[ORDERS:service:order-factory] STOP new order creation`);
  console.log(`[ORDERS:service:order-factory] STOP new order creation`);
  newOrderCreationRunning = false;
  if (currentNewOrderTimer) {
    clearTimeout(currentNewOrderTimer);
    currentNewOrderTimer = null;
  }
}

setTimeout(createNewOrders, 10);

accurateTimer(logOrderCreationRate, 1000);

function calculateOrderFrequency(ordersPerSecond: number) {
  if (ordersPerSecond > 10000) {
    throw Error(
      `[ORDERS:service:order-factory] cannot generate > 10,000 orders per second`
    );
  } else if (ordersPerSecond > 1000) {
    return {
      newOrderInterval: 100,
      newOrdersPerBatch: Math.ceil(ordersPerSecond / 10),
    };
  } else if (ordersPerSecond > 100) {
    return {
      newOrderInterval: 250,
      newOrdersPerBatch: Math.ceil(ordersPerSecond / 4),
    };
  } else if (ordersPerSecond > 10) {
    return {
      newOrderInterval: 1000,
      newOrdersPerBatch: ordersPerSecond,
    };
  } else {
    return {
      newOrderInterval: 1000,
      newOrdersPerBatch: ordersPerSecond,
    };
  }
}
