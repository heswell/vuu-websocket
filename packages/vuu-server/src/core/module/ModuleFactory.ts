import { IProvider, Provider, ProviderFactory } from "../../provider/Provider";
import { TableDef } from "../../api/TableDef";
import { TableJoinFactory } from "../../TableJoinProvider";
import { ViewServerModule } from "./VsModule";
import tableDefContainer from "./TableDefContainer";
import { Table } from "@heswell/data";
import { ProviderContainer } from "../../provider/ProviderContainer";
import { ViewPortDef } from "../../api/ViewPortDef";
import { TableContainer } from "../table/TableContainer";
import { RpcHandlerFunc } from "../../net/rpc/RpcHandler";

export type TableDefTuple = [TableDef, ProviderFactory];

export type ServiceFactory = (
  table: Table,
  provider: Provider,
  providerContainer: ProviderContainer,
  tableContainer: TableContainer
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
  joinDefs: TableJoinFactory[]
): TableDefs {
  return {
    add: (tableDef: TableDef, providerFactory: ProviderFactory) =>
      TableDefs(
        realizedTableDefs,
        tableDefs.concat([[tableDef, providerFactory]]),
        joinDefs
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
            .join(",")}]`
        );
      }
    },
  };
}

function ModuleFactoryNode(
  tableDefs: TableDefs,
  rpcHandlers: RpcHandlerFunc[],
  viewPortDefs: Map<string, ServiceFactory>,
  moduleName: string
) {
  return {
    addTable: (
      tableDef: TableDef,
      providerFactory: ProviderFactory,
      serviceFactory?: ServiceFactory
    ) => {
      if (serviceFactory) {
        viewPortDefs.set(tableDef.name, serviceFactory);
      }
      return ModuleFactoryNode(
        tableDefs.add(tableDef, providerFactory),
        rpcHandlers,
        viewPortDefs,
        moduleName
      );
    },
    addJoinTable: (func: TableJoinFactory) =>
      ModuleFactoryNode(
        tableDefs.addJoin(func),
        rpcHandlers,
        viewPortDefs,
        moduleName
      ),

    addRpcHandler: (rpcFunc: RpcHandlerFunc) =>
      ModuleFactoryNode(
        tableDefs,
        rpcHandlers.concat(rpcFunc),
        viewPortDefs,
        moduleName
      ),

    asModule(): ViewServerModule {
      const baseTables = tableDefs.tableDefsAndProviders;
      const justBaseTables = baseTables.map(([tableDef]) => tableDef);
      let mutableTableDefs = TableDefs(justBaseTables, [], []);

      // order is important here, add the matable defs before we iterate the joindefs
      tableDefContainer.add(moduleName, mutableTableDefs);

      tableDefs.joinDefFuncs.forEach((toJTFunc) => {
        const realizedJoinTable = toJTFunc(tableDefContainer);
        mutableTableDefs = mutableTableDefs.addRealized(realizedJoinTable);
      });

      console.log(`[ModuleFactory] as Module`, {
        viewPortDefs,
      });

      return new (class extends ViewServerModule {
        getProviderForTable(table: Table): IProvider {
          const tableProviderTuple = baseTables.find(
            ([{ name }]) => name === table.name
          );
          if (tableProviderTuple) {
            const [, providerFactory] = tableProviderTuple;
            return providerFactory(table);
          } else {
            throw Error(
              `[ViewServerModule] getProviderForTable, no baseTable ${table.name}`
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
    ModuleFactoryNode(TableDefs([], [], []), [], new Map(), name),
};
