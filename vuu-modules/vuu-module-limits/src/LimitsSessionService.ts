import {
  CreateSessionTableRpcHandler,
  RpcNames,
  type CellEdit,
  type InMemSessionDataTable,
  type PreparedSessionSave,
  type RequestContext,
  type RpcParams,
  type TableContainer,
} from "@heswell/vuu-server";
import type { Viewport } from "@heswell/vuu-server";
import type { RpcResult } from "@vuu-ui/vuu-protocol-types";
import type { LimitChange, LimitsStore } from "./LimitsStore";
import {
  LIMIT_DEFINITION_COLUMNS,
  LIMIT_INSERT_ONLY_COLUMNS,
} from "./tableDefs";
import {
  validateLimitDefinition,
  validateLimitValue,
  type LimitValues,
} from "./validation";

type SessionChange = LimitChange & { error?: string; rowName: string };

/**
 * Service of viewports on the edit and import session tables. Values are
 * checked as they are entered. Saving is all or nothing: if any limit is
 * not valid, nothing is saved, each invalid limit has its vuuMsg set and
 * the save fails, naming them. Saved changes wait for the next business
 * day, see {@link LimitsStore}.
 */
export class LimitsSessionService extends CreateSessionTableRpcHandler {
  #store: LimitsStore;

  constructor(tableContainer: TableContainer, store: LimitsStore) {
    super(tableContainer);
    this.#store = store;
  }

  /** A row added without a key is given the next limit_id. */
  processRpcRequest(
    rpcName: string,
    rpcParams: RpcParams,
  ): RpcResult | Promise<RpcResult> {
    if (rpcName === RpcNames.AddRowRpc && rpcParams.namedParams.key == null) {
      return super.processRpcRequest(rpcName, {
        ...rpcParams,
        namedParams: {
          ...rpcParams.namedParams,
          key: this.#store.nextLimitId(),
        },
      });
    }
    return super.processRpcRequest(rpcName, rpcParams);
  }

  protected validateCellEdit({ column, row, table, value }: CellEdit) {
    const isAddedRow = row[table.columnMap.vuuAction] === "addRow";
    if (LIMIT_INSERT_ONLY_COLUMNS.includes(column) && !isAddedRow) {
      return `${column} can only be set when a limit is added`;
    }
    return validateLimitValue(column, value);
  }

  protected canSaveSession(
    viewport: Viewport,
    prepared: PreparedSessionSave,
  ): boolean | string {
    const sessionTable = viewport.dataTable as InMemSessionDataTable;
    const errors = this.#sessionChanges(sessionTable, prepared).filter(
      ({ error }) => error !== undefined,
    );
    if (errors.length === 0) {
      return true;
    }
    for (const { error, key } of errors) {
      this.#setMessage(sessionTable, key, error as string);
    }
    const count = errors.length === 1 ? "1 limit" : `${errors.length} limits`;
    return `${count} could not be saved. ${errors
      .map(({ error, rowName }) => `${rowName}: ${error}`)
      .join(", ")}`;
  }

  protected applySessionSave(
    sessionTable: InMemSessionDataTable,
    prepared: PreparedSessionSave,
    ctx?: RequestContext,
  ) {
    this.#store.save(
      this.#sessionChanges(sessionTable, prepared),
      ctx?.user.name ?? "",
    );
    this.tableContainer.removeSessionTable(sessionTable.name);
  }

  #sessionChanges(
    sessionTable: InMemSessionDataTable,
    { changes }: PreparedSessionSave,
  ): SessionChange[] {
    const { columnMap } = sessionTable;
    const columns = LIMIT_DEFINITION_COLUMNS.filter(
      (name) => columnMap[name] !== undefined,
    );
    return changes.map(({ action, key, row }) => {
      // vuuRowNum numbers the data rows of a CSV from 1, after the header
      const rowName =
        columnMap.vuuRowNum === undefined
          ? key
          : `line ${Number(row[columnMap.vuuRowNum]) + 1}`;
      if (action === "deleteRow") {
        return { action, key, rowName };
      }
      const values: LimitValues = Object.fromEntries(
        columns.map((name) => [name, row[columnMap[name]]]),
      );
      return {
        action: action === "addRow" ? "addRow" : "editCell",
        error: validateLimitDefinition({
          ...this.#store.values(key),
          ...values,
        }),
        key,
        rowName,
        values,
      };
    });
  }

  #setMessage(sessionTable: InMemSessionDataTable, key: string, message: string) {
    const row = sessionTable.getRowAtKey(key).slice();
    row[sessionTable.columnMap.vuuMsg] = message;
    sessionTable.update(sessionTable.rowIndexAtKey(key), row);
  }
}
