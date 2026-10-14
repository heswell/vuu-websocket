import { Clock } from "@vuu-ui/vuu-utils";
import { createTable } from "../../core/table/TableContainer";
import { random } from "../../data-utils";
import { buildDataColumnMap } from "../../Table";
import { schemas } from "../simul-schemas";
import { accounts } from "./accounts";
import { algos } from "./algos";
import { getInstrumentsData } from "./instruments";
import type { Table } from "../../Table";
import { orderStatus as statusValues } from "./orderStatus";
import { sides } from "./sides";

const instrumentMap = buildDataColumnMap(schemas, "instruments");

// const PARENT_ORDER_COUNT = 75_000;
const PARENT_ORDER_COUNT = 5_000;
const CHILD_ORDER_COUNT = 20_000;
// const CHILD_ORDER_COUNT = 200_000;

const avgChildOrderPerOrder = Math.round(
  CHILD_ORDER_COUNT / PARENT_ORDER_COUNT,
);
const childMaxMultiple = 10;

/**
 * Generated parent and child orders. Each instance has its own tables
 * and (optional) timer generating new orders.
 */
export class ParentChildOrders {
  readonly parentOrdersTable: Table;
  readonly childOrdersTable: Table;
  #clock = new Clock().goBack(120, "minutes");
  #parentOrderCount = 0;
  #childOrderCount = 0;
  #newOrderInterval: undefined | ReturnType<typeof setInterval>;

  constructor() {
    this.parentOrdersTable = createTable(
      schemas.parentOrders,
      [],
      buildDataColumnMap(schemas, "parentOrders"),
    );
    this.childOrdersTable = createTable(
      schemas.childOrders,
      [],
      buildDataColumnMap(schemas, "childOrders"),
    );
    for (let i = 0; i < PARENT_ORDER_COUNT; i++) {
      this.#clock.advance(random(0, 100));
      this.createParentAndChildOrders();
    }
    this.#clock.showCurrentTime = true;
  }

  get isGenerating() {
    return this.#newOrderInterval !== undefined;
  }

  startGeneratingNewOrders() {
    if (this.#newOrderInterval === undefined) {
      this.#newOrderInterval = setInterval(
        () => this.createParentAndChildOrders(),
        100,
      );
    }
  }

  stopGeneratingNewOrders() {
    if (this.#newOrderInterval !== undefined) {
      clearInterval(this.#newOrderInterval);
      this.#newOrderInterval = undefined;
    }
  }

  createParentAndChildOrders() {
    const clock = this.#clock;
    const instrumentsData = getInstrumentsData();
    this.#parentOrderCount += 1;
    const parentOrderCount = this.#parentOrderCount;
    const instrument = instrumentsData[random(0, instrumentsData.length - 1)];
    const orderQuantity = 1000 * random(1, 100);
    const orderStatus = statusValues[random(0, statusValues.length - 1)];
    const filledQty =
      orderStatus === "FILLED"
        ? orderQuantity
        : orderStatus === "NEW"
          ? 0
          : orderQuantity - random(100, orderQuantity);
    const openQty = orderQuantity - filledQty;
    const account = accounts[random(0, accounts.length - 1)];
    const algo = algos[random(0, algos.length - 1)];
    const averagePrice = 0;
    const ccy = "GBP";
    const exchange = instrument[instrumentMap.exchange];
    const parentOrderIdAsInt = parentOrderCount;
    const parentOrderId = parentOrderCount.toString().padStart(10, "0");
    const price = 100;
    const quantity = orderQuantity;
    const ric = instrument[instrumentMap.ric];
    const side = sides[random(0, sides.length - 1)];
    const status = orderStatus;
    const volLimit = 100;
    const lastUpdate = clock.now;
    const created = clock.now;

    const numberOfChildOrders = random(
      0,
      avgChildOrderPerOrder * random(1, childMaxMultiple),
    );

    let remainingQty = orderQuantity;
    for (let j = 0; j < numberOfChildOrders; j++) {
      this.#childOrderCount += 1;
      const childOrderCount = this.#childOrderCount;

      const childOrderQuantity = Math.round(
        remainingQty / (childOrderCount - j),
      );
      remainingQty -= childOrderQuantity;
      const childOrderStatus = statusValues[random(0, statusValues.length - 1)];
      const childFilledQty =
        orderStatus === "FILLED"
          ? childOrderQuantity
          : childOrderStatus === "NEW"
            ? 0
            : childOrderQuantity - random(100, childOrderQuantity);
      const childOpenQty = childOrderQuantity - childFilledQty;
      const averagePrice = 0;
      const childIdAsInt = childOrderCount;
      const childId = childOrderCount.toString().padStart(10, "0");
      const lastUpdate = 0;
      const price = 100;
      const strategy = 0;

      this.childOrdersTable.insert([
        account,
        averagePrice,
        ccy,
        exchange,
        childFilledQty,
        childId,
        childIdAsInt,
        childOpenQty,
        parentOrderId,
        price,
        childOrderQuantity,
        ric,
        side,
        childOrderStatus,
        strategy,
        volLimit,
        lastUpdate,
        created,
        "",
      ]);
    }

    this.parentOrdersTable.insert([
      account,
      algo,
      averagePrice,
      ccy,
      this.#childOrderCount,
      exchange,
      filledQty,
      parentOrderId,
      parentOrderIdAsInt,
      openQty,
      price,
      quantity,
      ric,
      side,
      status,
      volLimit,
      lastUpdate,
      created,
      "",
    ]);
  }
}
