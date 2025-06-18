import { ProviderFactory } from "../../Provider";
import { ServiceFactory } from "../../Service";
import { TableDef } from "../../api/TableDef";
import { TableJoinFactory } from "../../TableJoinProvider";
import { ViewServerModule } from "./VsModule";
import tableDefContainer from "./TableDefContainer";

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
      const tableDef = tableDefs.find(([{ name }]) => name === tableName);
      if (tableDef) {
        return tableDef[0];
      } else {
        throw Error(
          `Table ${tableName} could not be found in ${tableDefs
            .map(([td]) => td.name)
            .join(",")}`
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
      console.log(tableDefs);
      const baseTables = tableDefs.tableDefsAndProviders;
      const justBaseTables = baseTables.map(([tableDef]) => tableDef);
      const mutableTableDefs = TableDefs(justBaseTables, [], []);
      tableDefContainer.add(moduleName, mutableTableDefs);

      return new ViewServerModule({
        name: moduleName,
        tableDefsAndProviders: baseTables,
      });
    },
  };
}

export const ModuleFactory = {
  withNameSpace: (name: string) =>
    ModuleFactoryNode(TableDefs([], [], []), name),
};
