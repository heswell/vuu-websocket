import { IProvider, ProviderFactory } from "../../Provider";
import { ServiceFactory } from "../../Service";
import { TableDef } from "../../api/TableDef";
import { TableJoinFactory } from "../../TableJoinProvider";
import { ViewServerModule } from "./VsModule";
import tableDefContainer from "./TableDefContainer";
import { VuuServer } from "../VuuServer";
import { Table } from "@heswell/data";

export type TableDefTuple = [TableDef, ProviderFactory];

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

function ModuleFactoryNode(tableDefs: TableDefs, moduleName: string) {
  return {
    addTable: (
      tableDef: TableDef,
      providerFactory: ProviderFactory,
      serviceFactory?: ServiceFactory
    ) =>
      ModuleFactoryNode(tableDefs.add(tableDef, providerFactory), moduleName),

    addJoinTable: (func: TableJoinFactory) =>
      ModuleFactoryNode(tableDefs.addJoin(func), moduleName),

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
      })({
        name: moduleName,
        tableDefs: mutableTableDefs.realizedTableDefs,
      });
    },
  };
}

export const ModuleFactory = {
  withNameSpace: (name: string) =>
    ModuleFactoryNode(TableDefs([], [], []), name),
};
