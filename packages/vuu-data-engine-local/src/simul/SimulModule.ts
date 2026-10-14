import type {
  ClientToServerMenuRowRPC,
  VuuLink,
  VuuMenu,
} from "@vuu-ui/vuu-protocol-types";
import {
  type MenuServiceHandler,
  type RpcMenuService,
  type RpcService,
  type ServiceHandler,
  VuuModule,
} from "../core/module/VuuModule";
import type { Table } from "../Table";
import { createJoinTable } from "../core/table/TableContainer";
import type { BaseUpdateGenerator } from "../UpdateGenerator";
import { createInstrumentsTable } from "./reference-data/instruments";
import { createInstrumentsExtendedTable } from "./reference-data/instruments-extended";
import { createOrdersTable } from "./reference-data/orders";
import { ParentChildOrders } from "./reference-data/parent-child-orders";
import { createPricesTable, type PricesTable } from "./reference-data/prices";
import { schemas, type SimulTableName } from "./simul-schemas";

const undefinedTables = {
  childOrders: undefined,
  instruments: undefined,
  instrumentsExtended: undefined,
  instrumentPrices: undefined,
  orders: undefined,
  parentOrders: undefined,
  prices: undefined,
};

/**
 * This is an example of how we might extend the built-in VuuModule to
 * implement a module-specific service in such a way that it can invoke
 * methods on the VuuModule.
 */
export class SimulModule extends VuuModule<SimulTableName> {
  #schemas = schemas;
  #tables: Record<SimulTableName, Table>;
  #orders: ParentChildOrders;
  #pricesUpdateGenerator: BaseUpdateGenerator;

  /**
   * Each instance generates its own tables. Prices start ticking when the
   * first dataSource is created; call `dispose` to stop all timers.
   */
  constructor() {
    super("SIMUL");
    const instruments = createInstrumentsTable();
    const { table: prices, updateGenerator } = createPricesTable();
    this.#pricesUpdateGenerator = updateGenerator;
    this.#orders = new ParentChildOrders();
    this.#tables = {
      childOrders: this.#orders.childOrdersTable,
      instruments,
      instrumentsExtended: createInstrumentsExtendedTable(),
      instrumentPrices: createJoinTable(
        { module: "SIMUL", table: "instrumentPrices" },
        instruments,
        prices,
        "ric",
      ),
      orders: createOrdersTable(),
      parentOrders: this.#orders.parentOrdersTable,
      prices,
    };
  }

  protected override beforeCreateDataSource() {
    this.#pricesUpdateGenerator.start();
  }

  /** The prices table and its update generator, e.g. to share with BasketModule. */
  get prices(): PricesTable {
    return {
      table: this.#tables.prices,
      updateGenerator: this.#pricesUpdateGenerator,
    };
  }

  override dispose() {
    this.#pricesUpdateGenerator.stop();
    this.#orders.stopGeneratingNewOrders();
    super.dispose();
  }

  get menus(): Record<SimulTableName, VuuMenu | undefined> | undefined {
    return {
      childOrders: undefined,
      instruments: {
        name: "ROOT",
        menus: [
          {
            context: "selected-rows",
            filter: "",
            name: "Add Instruments To Order",
            rpcName: "ADD_INSTRUMENTS_TO_ORDER",
          },
          {
            context: "selected-rows",
            filter: "",
            name: "Edit Row (server)",
            rpcName: "EDIT_ROW",
          },
          {
            context: "selected-rows",
            filter: "",
            name: "Edit Rows (server)",
            rpcName: "beginEditSession",
          },
        ],
      },
      instrumentsExtended: undefined,
      instrumentPrices: undefined,
      orders: {
        name: "ROOT",
        menus: [
          {
            context: "row",
            filter: `status in ["New","Partial Exec"]`,
            name: "Cancel Order",
            rpcName: "CANCEL_ORDER",
          },
        ],
      },
      parentOrders: undefined,
      prices: undefined,
    };
  }

  get schemas() {
    return this.#schemas;
  }

  get editServices() {
    return undefined;
  }

  get menuServices():
    Record<SimulTableName, RpcMenuService[] | undefined> | undefined {
    return {
      ...undefinedTables,
      orders: [
        {
          rpcName: "CANCEL_ORDER",
          service: this.cancelOrder,
        },
      ],
    };
  }

  get services(): Record<SimulTableName, RpcService[] | undefined> | undefined {
    return {
      ...undefinedTables,
      instruments: [
        {
          rpcName: "DELETE_ROW",
          service: this.deleteSourceRow,
        },
      ],
      parentOrders: [
        {
          rpcName: "startGeneratingNewOrders",
          service: this.startOrders,
        },
        {
          rpcName: "stopGeneratingNewOrders",
          service: this.stopOrders,
        },
      ],
    };
  }

  get tables() {
    return this.#tables;
  }

  get visualLinks(): Record<SimulTableName, VuuLink[] | undefined> {
    return {
      ...undefinedTables,
      childOrders: [
        {
          fromColumn: "parentOrderId",
          toColumn: "id",
          toTable: "parentOrders",
        },
      ],
      parentOrders: [
        { fromColumn: "ric", toColumn: "ric", toTable: "instruments" },
      ],
    };
  }

  cancelOrder: MenuServiceHandler = async (rpcRequest) => {
    const { rowKey, vpId } = rpcRequest as ClientToServerMenuRowRPC;
    const table = this.tables.orders;
    table.update(rowKey, "status", "Cancelled");

    return {
      action: {
        type: "SHOW_NOTIFICATION_ACTION",
        message: `Order id: ${rowKey}`,
        title: "Order cancelled",
      },
      rpcName: "CANCEL_ORDER",
      type: "VIEW_PORT_MENU_RESP",
      vpId,
    };
  };

  startOrders: ServiceHandler = async () => {
    this.#orders.startGeneratingNewOrders();
    return {
      type: "SUCCESS_RESULT",
      data: undefined,
    };
  };
  stopOrders: ServiceHandler = async () => {
    this.#orders.stopGeneratingNewOrders();
    return {
      type: "SUCCESS_RESULT",
      data: undefined,
    };
  };
}
