import { Table } from "@heswell/data";
import { IProvider } from "../../provider/Provider";
import { VuuLink } from "@vuu-ui/vuu-protocol-types";
import { IService, ServiceMessage } from "../../Service";
import { TableDef } from "../../api/TableDef";
import { RpcHandler, RpcHandlerFunc } from "../../net/rpc/RpcHandler";
import { ServiceFactory } from "./ModuleFactory";

export interface ModuleConstructorProps {
  name: string;
  tableDefs: TableDef[];
}

export class ViewServerModule {
  #name: string;
  #tableDefs: TableDef[];
  #links = new Map<string, VuuLink[]>();
  #services = new Map<string, IService>();

  // this will be overridden at class creation time, see ModuleFactory
  rpcHandlersUnrealized: RpcHandlerFunc[] = [];

  // this will be overridden at class creation time, see ModuleFactory
  viewPortDefs: Map<string, ServiceFactory> = new Map();

  constructor({ name, tableDefs }: ModuleConstructorProps) {
    this.#name = name;
    this.#tableDefs = tableDefs;
  }

  get name() {
    return this.#name;
  }

  private getTableDef(tableName: string) {
    const tableDef = this.#tableDefs.find((td) => td.name === tableName);
    if (tableDef) {
      return tableDef;
    } else {
      throw Error(`[ViewServerModule] getTableDef, no tableDef ${tableName}`);
    }
  }

  // getSessionAndBaseTable(sessionTableName: string): [Table, Table] {
  //   const sessionTable = this.getTable(sessionTableName);
  //   const tableName = this.#sessionTableMap.get(sessionTableName);
  //   if (tableName === undefined) {
  //     throw Error(
  //       `[Module] getSessionAndBaseTable no map entry for session table ${sessionTableName}`
  //     );
  //   }
  //   const baseTable = this.getTable(tableName);
  //   return [sessionTable, baseTable];
  // }

  addLinks(table: Table, links: VuuLink[]) {
    this.#links.set(table.name, links);
  }

  async start() {
    console.log(`[Module] start #${this.#name}`);
  }

  get tableDefs() {
    return this.#tableDefs;
  }

  getTableList() {
    return this.#tableDefs.map((tableDef) => tableDef.asVuuTable);
  }

  getTableSchema(tableName: string) {
    return this.getTableDef(tableName).schema;
  }

  getProviderForTable(table: Table): IProvider {
    throw Error(
      `getProviderForTable ${table.name} implementation needs to be provided dynamically, see ModuleFactory.asModule`
    );
  }

  getLinks(tableName: string) {
    return this.#links.get(tableName);
  }

  getMenu(tableName: string) {
    return this.#services.get(tableName)?.getMenu();
  }

  invokeService(tableName: string, service: ServiceMessage) {
    const { name, namedParams } = service;
    // Some services are general and handled by Module. Otherwise, we assume they
    // will be handled by a registered custom service
    switch (name) {
      case "VP_BULK_EDIT_SUBMIT_RPC":
        {
          // const [sessionTable, baseTable] =
          //   this.getSessionAndBaseTable(tableName);
          // for (const row of sessionTable.rows) {
          //   // TODO how do we 'lock' the target before applying edits
          //   baseTable.upsert(row);
          // }
        }
        break;
      case "VP_BULK_EDIT_COLUMN_CELLS_RPC":
        {
          // const table = this.getTable(tableName);
          // const { column, value } = namedParams as {
          //   column: string;
          //   value: VuuRowDataItemType;
          // };
          // const { columnMap, rowCount } = table;
          // const colIdx = columnMap[column];
          // for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
          //   table.update(rowIdx, [colIdx, value], true);
          // }
        }
        break;

      default:
        return this.#services.get(tableName)?.invokeService(service);
    }
  }
}

export class RealizedViewServerModule extends ViewServerModule {
  rpcHandlers: RpcHandler[] = [];
  constructor(props: ModuleConstructorProps) {
    super(props);
  }

  rpcHandlerByService(service: string): RpcHandler {
    const rpcHandler = this.rpcHandlers.find((rpcHandler) =>
      rpcHandler.implementsService(service)
    );
    if (rpcHandler) {
      return rpcHandler;
    } else {
      throw Error(
        `[RealizedViewServerModule] no rpcHandler for service '${service}'`
      );
    }
  }
}
