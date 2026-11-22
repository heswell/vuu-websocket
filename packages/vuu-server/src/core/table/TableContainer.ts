import { Table } from "@heswell/vuu-table";
import { JoinTableProvider } from "../../provider/JoinTableProvider";
import { VuuTable } from "@vuu-ui/vuu-protocol-types";
import { DataTable } from "./InMemDataTable";
import { InMemSessionDataTable } from "./InMemSessionDataTable";
import { ClientSessionId } from "../../net/ClientConnectionCreator";
import {
  isSessionTableDef,
  legacySessionTableDef,
  toSessionTableInstanceDef,
  type Column,
} from "../../api/TableDef";
import { getLogger } from "@heswell/service-utils/browser";
import { TableNotFoundError } from "../../net/ClientRequestError";

const log = getLogger("vuu.table");

export class TableContainer {
  constructor(private joinProvider: JoinTableProvider) {
    log.debug("create TableContainer");
  }

  #tables: Map<string, Table> = new Map();

  addTable(table: Table) {
    log.debug(`add table ${table.name}`);
    this.#tables.set(table.name, table);
  }

  getDefinedTables(): VuuTable[] {
    return this.#tables
      .values()
      .filter((table) => !(table instanceof InMemSessionDataTable))
      .map((table) => table.schema.table)
      .toArray();
  }

  getTable<T = Table>(tableName: string) {
    const table = this.#tables.get(tableName) as T;
    if (table) {
      return table;
    } else {
      throw new TableNotFoundError(tableName);
    }
  }

  /**
   * The session table blueprint registered (with ModuleFactory.addSessionTable)
   * under tableName. Throws if there is none.
   */
  getSessionTableBlueprint(tableName: string): DataTable {
    const table = this.#tables.get(tableName) as DataTable | undefined;
    if (
      table === undefined ||
      table instanceof InMemSessionDataTable ||
      !isSessionTableDef(table.tableDef)
    ) {
      throw Error(`session table ${tableName} is not defined`);
    }
    return table;
  }

  /**
   * Create an instance of a session table blueprint, owned by clientSession.
   * @param blueprint a table whose definition was registered with
   * ModuleFactory.addSessionTable, see getSessionTableBlueprint
   * @param sourceTable the table the session is created from
   */
  createSimpleSessionTable(
    blueprint: DataTable,
    clientSession: ClientSessionId,
    sourceTable: DataTable,
  ) {
    const { tableDef } = blueprint;
    if (!isSessionTableDef(tableDef)) {
      throw Error(`${tableDef.name} is not a session table definition`);
    }
    const table = new InMemSessionDataTable(
      clientSession.sessionId,
      toSessionTableInstanceDef(tableDef),
      this.joinProvider,
      sourceTable,
    );
    this.#tables.set(table.name, table);
    return table;
  }

  /**
   * Create a session table from the source table's own definition, as the
   * legacy beginEditSession does. No blueprint
   * is needed.
   */
  createLegacySessionTable(
    sourceTable: DataTable,
    clientSession: ClientSessionId,
    customColumns: Column[] = [],
  ) {
    const table = new InMemSessionDataTable(
      clientSession.sessionId,
      legacySessionTableDef(sourceTable.tableDef, customColumns),
      this.joinProvider,
      sourceTable,
    );
    this.#tables.set(table.name, table);
    return table;
  }

  removeSessionTables(clientSessionId: ClientSessionId) {
    const sessionTablePrefix = `session:${clientSessionId.sessionId}/`;
    for (const [tableName, table] of this.#tables) {
      if (
        table instanceof InMemSessionDataTable &&
        tableName.startsWith(sessionTablePrefix)
      ) {
        this.#tables.delete(tableName);
      }
    }
  }

  removeSessionTable(tableName: string) {
    // do we need to do any kind of cleanup
    this.#tables.delete(tableName);
  }

  hasTable(tableName: string) {
    return this.#tables.has(tableName);
  }

  /**
   * Re-register a session table, e.g. one removed by a session save that
   * subsequently failed.
   */
  restoreSessionTable(table: InMemSessionDataTable) {
    if (!this.#tables.has(table.name)) {
      this.#tables.set(table.name, table);
    }
  }
}
