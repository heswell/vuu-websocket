import {
  IProvider,
  NullProvider,
  Provider,
  ProviderFactory,
} from "../../provider/Provider";
import { TableDef } from "../../api/TableDef";
import { TableJoinFactory } from "../../TableJoinProvider";
import { ViewServerModule } from "./VsModule";
import { TableDefContainer } from "./TableDefContainer";
import { Table } from "@heswell/vuu-table";
import { ProviderContainer } from "../../provider/ProviderContainer";
import { ViewPortDef } from "../../api/ViewPortDef";
import { TableContainer } from "../table/TableContainer";
import { RpcHandlerFunc } from "../../net/rpc/RpcHandler";
import { DataTable } from "../table/InMemDataTable";
import { getLogger } from "@heswell/service-utils";

const log = getLogger("vuu.module");

export type TableDefTuple = [TableDef, ProviderFactory];

/**
 * Creates the {@link ViewPortDef} (columns + RPC/menu service) for a table.
 *
 * Lifecycle contract:
 * - Invoked once per viewport, when the viewport is created (CREATE_VP).
 *   The returned `ViewPortDef` (and its `RpcHandler`) belongs to that
 *   viewport, so handlers may keep per-viewport state.
 * - Never invoked for table metadata (GET_TABLE_META); metadata is derived
 *   from the table's `TableDef` columns, so `ViewPortDef.columns` should
 *   describe the table's columns.
 * - May be invoked many times over the server's life: anything with global
 *   side effects (subscriptions, timers, shared registrations) must be
 *   idempotent, or hoisted out of the factory. A factory may return a shared,
 *   stateless handler if it prefers.
 */
export type ServiceFactory = (
  table: DataTable,
  provider: IProvider | undefined,
  providerContainer: ProviderContainer,
  tableContainer: TableContainer,
) => ViewPortDef;

export interface TableDefs {
  add: (tableDef: TableDef, providerFactory: ProviderFactory) => TableDefs;
  addJoin: (joinDef: TableJoinFactory) => TableDefs;
  addRealized: (tableDef: TableDef) => TableDefs;
  joinDefFuncs: TableJoinFactory[];
  realizedTableDefs: TableDef[];
  tableDefsAndProviders: TableDefTuple[];
  get: (tableName: string) => TableDef;
}

export function TableDefs(
  realizedTableDefs: TableDef[],
  tableDefs: TableDefTuple[],
  joinDefs: TableJoinFactory[],
): TableDefs {
  return {
    add: (tableDef: TableDef, providerFactory: ProviderFactory) =>
      TableDefs(
        realizedTableDefs,
        tableDefs.concat([[tableDef, providerFactory]]),
        joinDefs,
      ),

    addJoin: (joinDef: TableJoinFactory) =>
      TableDefs(realizedTableDefs, tableDefs, joinDefs.concat(joinDef)),

    addRealized: (tableDef: TableDef) =>
      TableDefs(realizedTableDefs.concat(tableDef), tableDefs, joinDefs),

    get joinDefFuncs() {
      return joinDefs;
    },

    get tableDefsAndProviders() {
      return tableDefs;
    },

    get realizedTableDefs() {
      return realizedTableDefs;
    },

    get(tableName: string) {
      const tableDef = realizedTableDefs.find(({ name }) => name === tableName);
      if (tableDef) {
        return tableDef;
      } else {
        throw Error(
          `Table ${tableName} could not be found in [${this.realizedTableDefs
            .map((td) => td.name)
            .join(",")}]`,
        );
      }
    },
  };
}

function ModuleFactoryNode(
  tableDefs: TableDefs,
  rpcHandlers: RpcHandlerFunc[],
  viewPortDefs: Map<string, ServiceFactory>,
  moduleName: string,
  joinServiceFactories: Map<TableJoinFactory, ServiceFactory>,
) {
  return {
    addTable: (
      tableDef: TableDef,
      providerFactory: ProviderFactory,
      serviceFactory?: ServiceFactory,
    ) => {
      if (serviceFactory) {
        viewPortDefs.set(tableDef.name, serviceFactory);
      }
      return ModuleFactoryNode(
        tableDefs.add(tableDef, providerFactory),
        rpcHandlers,
        viewPortDefs,
        moduleName,
        joinServiceFactories,
      );
    },
    /**
     * The join table's name is only known once `asModule()` realises the
     * join, so an optional `serviceFactory` is registered under the realised
     * join table's name at that point.
     */
    addJoinTable: (
      func: TableJoinFactory,
      serviceFactory?: ServiceFactory,
    ) => {
      if (serviceFactory) {
        joinServiceFactories.set(func, serviceFactory);
      }
      return ModuleFactoryNode(
        tableDefs.addJoin(func),
        rpcHandlers,
        viewPortDefs,
        moduleName,
        joinServiceFactories,
      );
    },
    addSessionTable: (
      tableDef: TableDef,
      providerFactory: ProviderFactory = (table) => new NullProvider(table),
      serviceFactory?: ServiceFactory,
    ) => {
      if (serviceFactory) {
        viewPortDefs.set(tableDef.name, serviceFactory);
      }
      return ModuleFactoryNode(
        tableDefs.add(tableDef, providerFactory),
        rpcHandlers,
        viewPortDefs,
        moduleName,
        joinServiceFactories,
      );
    },

    addRpcHandler: (rpcFunc: RpcHandlerFunc) =>
      ModuleFactoryNode(
        tableDefs,
        rpcHandlers.concat(rpcFunc),
        viewPortDefs,
        moduleName,
        joinServiceFactories,
      ),

    asModule(): ViewServerModule {
      const baseTables = tableDefs.tableDefsAndProviders;
      const justBaseTables = baseTables.map(([tableDef]) => tableDef);
      let mutableTableDefs = TableDefs(justBaseTables, [], []);

      // order is important here, add the matable defs before we iterate the joindefs
      const tableDefContainer = TableDefContainer.instance;
      tableDefContainer.add(moduleName, mutableTableDefs);

      tableDefs.joinDefFuncs.forEach((toJTFunc) => {
        const realizedJoinTable = toJTFunc(tableDefContainer);
        mutableTableDefs = mutableTableDefs.addRealized(realizedJoinTable);
        const serviceFactory = joinServiceFactories.get(toJTFunc);
        if (serviceFactory) {
          viewPortDefs.set(realizedJoinTable.name, serviceFactory);
        }
      });

      if (log.isEnabled("trace")) {
        log.trace(`asModule ${moduleName}`, { viewPortDefs });
      }

      return new (class extends ViewServerModule {
        getProviderForTable(table: Table): IProvider {
          const tableProviderTuple = baseTables.find(
            ([{ name }]) => name === table.name,
          );
          if (tableProviderTuple) {
            const [, providerFactory] = tableProviderTuple;
            return providerFactory(table);
          } else {
            throw Error(
              `[ViewServerModule] getProviderForTable, no baseTable ${table.name}`,
            );
          }
        }
        rpcHandlersUnrealized = rpcHandlers;
        viewPortDefs = viewPortDefs;
      })({
        name: moduleName,
        tableDefs: mutableTableDefs.realizedTableDefs,
      });
    },
  };
}

export const ModuleFactory = {
  withNameSpace: (name: string) =>
    ModuleFactoryNode(TableDefs([], [], []), [], new Map(), name, new Map()),
};
