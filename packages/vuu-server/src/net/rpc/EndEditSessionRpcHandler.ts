import { RpcResult } from "@vuu-ui/vuu-protocol-types";
import { getLogger } from "@heswell/service-utils/browser";
import { TableContainer } from "../../core/table/TableContainer";
import {
  InMemSessionDataTable,
  SessionRowChange,
} from "../../core/table/InMemSessionDataTable";
import { DataTable } from "../../core/table/InMemDataTable";
import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import { EditTableRpcHandler } from "./EditTableRpcHandler";
import { RpcParams } from "./Rpc";
import { RpcNames } from "../../util/RpcNames";
import type { Viewport } from "../../viewport/Viewport";
import type { RequestContext } from "../RequestProcessor";
import { isRowPermitted, permissionPredicate } from "./EditValidation";

export type PreparedSessionChange = SessionRowChange & {
  sourceRow?: VuuDataRow;
};

export type PreparedSessionSave = {
  sourceTable: DataTable;
  changes: PreparedSessionChange[];
};

/**
 * Result of {@link EndEditSessionRpcHandler.canSaveSession}. true permits
 * the save, false or a string (the reason) refuses it.
 */
export type CanSaveSessionResult = boolean | string;

/**
 * Result of {@link EndEditSessionRpcHandler.applySessionSave}. undefined,
 * true or a SUCCESS_RESULT mean the save succeeded. false or an
 * ERROR_RESULT (as does a thrown error) mean it failed, the session is left
 * open so the user can retry or cancel.
 */
export type SessionSaveResult = void | boolean | RpcResult;

const SAVE_NOT_PERMITTED = "endEditSession: save not permitted";
const SAVE_FAILED = "endEditSession: save failed";

const log = getLogger("vuu.rpc");

const errorResult = (errorMessage: string): RpcResult => ({
  type: "ERROR_RESULT",
  errorMessage,
});

const messageOf = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)) || SAVE_FAILED;

const isPromise = <T>(value: unknown): value is Promise<T> =>
  typeof (value as Promise<T>)?.then === "function";

/**
 * Invoke fn, passing its result to onValue. Stays synchronous unless fn (or
 * onValue) returns a Promise. Errors, sync or async, go to onError.
 */
function chain<T, R>(
  fn: () => T | Promise<T>,
  onValue: (value: T) => R | Promise<R>,
  onError: (error: unknown) => R,
): R | Promise<R> {
  let value: T | Promise<T>;
  try {
    value = fn();
  } catch (error) {
    return onError(error);
  }
  if (isPromise<T>(value)) {
    return value.then(onValue, onError);
  }
  try {
    const result = onValue(value);
    return isPromise<R>(result) ? result.catch(onError) : result;
  } catch (error) {
    return onError(error);
  }
}

export class EndEditSessionRpcHandler extends EditTableRpcHandler {
  endEditSession = (params: RpcParams): RpcResult | Promise<RpcResult> =>
    this.handleEndEditSession(params);

  /**
   * Authorise a session save. Called after the changes have been prepared
   * (and validated as not stale), before {@link applySessionSave}. Return
   * false, or a reason string, to refuse the save; the session stays open.
   * Default true.
   */
  protected canSaveSession(
    _viewport: Viewport,
    _prepared: PreparedSessionSave,
    _ctx: RequestContext,
  ): CanSaveSessionResult | Promise<CanSaveSessionResult> {
    return true;
  }

  protected handleEndEditSession({
    namedParams: { force, save },
    viewport,
    ctx,
  }: RpcParams): RpcResult | Promise<RpcResult> {
    const sessionTable = viewport.dataTable;
    if (!(sessionTable instanceof InMemSessionDataTable)) {
      return errorResult(
        "endEditSession: viewport is not using a session table",
      );
    }
    if (ctx?.session?.sessionId !== sessionTable.ownerSessionId) {
      return errorResult("endEditSession: session table not found");
    }

    if (!save) {
      this.tableContainer.removeSessionTable(sessionTable.name);
      return { type: "SUCCESS_RESULT", data: undefined };
    }

    const prepared = this.prepareSessionSave(sessionTable, force === true, ctx);
    if ("type" in prepared) return prepared;

    return this.saveSession(viewport, sessionTable, prepared, ctx, () =>
      this.prepareSessionSave(sessionTable, force === true, ctx),
    );
  }

  /**
   * canSaveSession then applySessionSave. A refusal, a failed apply or an
   * error returns ERROR_RESULT and leaves the session table open.
   */
  protected saveSession(
    viewport: Viewport,
    sessionTable: InMemSessionDataTable,
    prepared: PreparedSessionSave,
    ctx: RequestContext,
    reprepare?: () => PreparedSessionSave | RpcResult,
  ): RpcResult | Promise<RpcResult> {
    const fail = (errorMessage: string) => {
      log.debug(`endEditSession: save refused, ${errorMessage}`);
      // applySessionSave may have closed the session before failing
      this.tableContainer.restoreSessionTable(sessionTable);
      return errorResult(errorMessage);
    };
    const onError = (error: unknown) => {
      log.warn(
        `endEditSession: save of ${sessionTable.name} threw, ${messageOf(error)}`,
      );
      return fail(messageOf(error));
    };

    let isAsync = false;
    return chain(
      () => {
        const permitted = this.canSaveSession(viewport, prepared, ctx);
        isAsync = isPromise(permitted);
        return permitted;
      },
      (permitted) => {
        if (permitted !== true) {
          return fail(
            typeof permitted === "string" && permitted
              ? permitted
              : SAVE_NOT_PERMITTED,
          );
        }
        let changes = prepared;
        if (isAsync && reprepare) {
          // the source table may have changed while canSaveSession was
          // pending, re-validate before applying
          const reprepared = reprepare();
          if ("type" in reprepared) return reprepared;
          changes = reprepared;
        }
        return chain(
          () => this.applySessionSave(sessionTable, changes, ctx),
          (result): RpcResult => {
            if (result === false) {
              return fail(SAVE_FAILED);
            }
            if (result && typeof result === "object") {
              return result.type === "ERROR_RESULT"
                ? fail(result.errorMessage || SAVE_FAILED)
                : result;
            }
            return { type: "SUCCESS_RESULT", data: undefined };
          },
          onError,
        );
      },
      onError,
    );
  }

  /**
   * Validate the session changes against the source table (stale rows,
   * duplicate keys, permissions). `ctx` is the request context of the
   * endEditSession RPC.
   */
  protected prepareSessionSave(
    sessionTable: InMemSessionDataTable,
    force?: boolean,
    _ctx?: RequestContext,
  ): PreparedSessionSave | RpcResult {
    const sourceTable = this.tableContainer.getTable<DataTable>(
      sessionTable.tableDef.name,
    );
    const { columnMap } = sourceTable;
    const isPermitted = permissionPredicate(
      sessionTable.sourcePermissionFilter,
      columnMap,
    );
    const preparedChanges: PreparedSessionChange[] = [];
    let hasDuplicateKey = false;
    let hasStaleUpdate = false;
    const staleKeys: string[] = [];
    let hasPermissionError = false;

    for (const change of sessionTable.getSessionChanges()) {
      const { action, cellUpdates, key, row } = change;
      const sourceRow = sourceTable.getRowAtKey(key, false);

      if (action === "addRow") {
        if (sourceRow) {
          this.setSessionRowMessage(
            sessionTable,
            row,
            `addRow:${key}:key already exists`,
          );
          hasDuplicateKey = true;
        } else if (
          isPermitted &&
          !isPermitted(this.toSourceRow(sessionTable, sourceTable, row))
        ) {
          this.setSessionRowMessage(
            sessionTable,
            row,
            `addRow:${key}:not permitted`,
          );
          hasPermissionError = true;
        }
        preparedChanges.push(change);
        continue;
      }

      if (!sourceRow || !isRowPermitted(isPermitted, sourceRow)) {
        this.setSessionRowMessage(
          sessionTable,
          row,
          `${action || "editRow"}:${key}:source row missing`,
        );
        staleKeys.push(key);
        hasStaleUpdate = true;
        continue;
      }

      const changedColumns = force
        ? []
        : this.getStaleColumns(sourceTable, sourceRow, change);
      if (changedColumns.length > 0) {
        const tsIndex = columnMap.vuuUpdatedTimestamp;
        const updateTimestamp =
          tsIndex === undefined ? undefined : sourceRow[tsIndex];
        const suffix =
          updateTimestamp === undefined ? "" : `:${updateTimestamp}`;
        const messages = Object.entries(cellUpdates).map(
          ([column, value]) =>
            `${column}:${value}:${sourceRow[columnMap[column]]}${suffix}`,
        );
        if (action === "deleteRow") {
          messages.push(`deleteRow:${key}${suffix}`);
        }
        messages.push(`stale:${key}:${changedColumns.join("|")}`);
        this.setSessionRowMessage(sessionTable, row, messages.join(","));
        staleKeys.push(key);
        hasStaleUpdate = true;
        continue;
      }

      if (
        isPermitted &&
        action !== "deleteRow" &&
        !isPermitted(this.applyCellUpdates(sourceTable, sourceRow, cellUpdates))
      ) {
        this.setSessionRowMessage(
          sessionTable,
          row,
          `editRow:${key}:not permitted`,
        );
        hasPermissionError = true;
        continue;
      }

      preparedChanges.push({ ...change, sourceRow });
    }

    if (staleKeys.length > 0) {
      log.debug(`endEditSession: stale rows ${staleKeys.join(",")}`);
    }
    if (hasDuplicateKey) {
      return errorResult("duplicate key");
    }
    if (hasStaleUpdate) {
      return errorResult("stale update");
    }
    if (hasPermissionError) {
      return errorResult("not permitted");
    }

    return { sourceTable, changes: preparedChanges };
  }

  /**
   * Apply prepared changes to the source table and close the session. The
   * default implementation is atomic: if any change throws, changes already
   * applied are rolled back and the error is rethrown.
   *
   * Overrides may return false or an ERROR_RESULT (or throw) to report a
   * failed save, the session is then left open.
   *
   * `ctx` is the request context (user, session) of the endEditSession RPC,
   * the same one passed to {@link canSaveSession}. It is always passed by
   * the base class; it is optional only so that existing overrides and
   * callers with two arguments still compile.
   */
  protected applySessionSave(
    sessionTable: InMemSessionDataTable,
    { sourceTable, changes }: PreparedSessionSave,
    _ctx?: RequestContext,
  ): SessionSaveResult | Promise<SessionSaveResult> {
    const undo: Array<() => void> = [];
    try {
      for (const { action, key, row, cellUpdates, sourceRow } of changes) {
        if (action === "addRow") {
          if (sourceTable.getRowAtKey(key, false) !== undefined) {
            throw Error(`addRow:${key}:key already exists`);
          }
          sourceTable.insert(this.toSourceRow(sessionTable, sourceTable, row));
          undo.push(() => sourceTable.delete(key));
        } else if (action === "deleteRow") {
          const previousRow = sourceTable.getRowAtKey(key);
          sourceTable.delete(key);
          undo.push(() => sourceTable.insert(previousRow));
        } else if (sourceRow) {
          const previousRow = sourceTable.getRowAtKey(key);
          const updatedRow = this.applyCellUpdates(
            sourceTable,
            sourceRow,
            cellUpdates,
          );
          const tsIndex = sourceTable.columnMap.vuuUpdatedTimestamp;
          if (tsIndex !== undefined) updatedRow[tsIndex] = Date.now();
          sourceTable.update(sourceTable.rowIndexAtKey(key), updatedRow);
          undo.push(() =>
            sourceTable.update(sourceTable.rowIndexAtKey(key), previousRow),
          );
        }
      }
    } catch (error) {
      for (const undoChange of undo.reverse()) {
        try {
          undoChange();
        } catch (undoError) {
          log.error(
            `endEditSession: failed to roll back session save, ${messageOf(undoError)}`,
          );
        }
      }
      throw error;
    }

    this.tableContainer.removeSessionTable(sessionTable.name);
  }

  /**
   * Names of the source columns that changed since the row was copied into
   * the session. Compares the live source row with the snapshot taken when
   * the session was created, so it works for tables without a
   * vuuUpdatedTimestamp column. When there is no snapshot, falls back to
   * the vuuUpdatedTimestamp captured when the row was first edited.
   */
  protected getStaleColumns(
    sourceTable: DataTable,
    sourceRow: VuuDataRow,
    { lastUpdateTimestamp, sourceSnapshot }: SessionRowChange,
  ): string[] {
    const { columns } = sourceTable.schema;
    const tsIndex = sourceTable.columnMap.vuuUpdatedTimestamp;
    if (sourceSnapshot) {
      return columns
        .filter(({ name }) => {
          const index = sourceTable.columnMap[name];
          return !Object.is(sourceSnapshot[index], sourceRow[index]);
        })
        .map(({ name }) => name);
    }
    if (tsIndex !== undefined && lastUpdateTimestamp !== sourceRow[tsIndex]) {
      return ["vuuUpdatedTimestamp"];
    }
    return [];
  }

  private toSourceRow(
    sessionTable: InMemSessionDataTable,
    sourceTable: DataTable,
    sessionRow: VuuDataRow,
  ): VuuDataRow {
    return sourceTable.schema.columns.map(
      ({ name }) => sessionRow[sessionTable.columnMap[name]],
    );
  }

  private applyCellUpdates(
    sourceTable: DataTable,
    sourceRow: VuuDataRow,
    cellUpdates: PreparedSessionChange["cellUpdates"],
  ) {
    const { columnMap } = sourceTable;
    const updatedRow = sourceRow.slice();
    for (const [column, value] of Object.entries(cellUpdates)) {
      const columnIndex = columnMap[column];
      if (columnIndex !== undefined) updatedRow[columnIndex] = value;
    }
    return updatedRow;
  }

  private setSessionRowMessage(
    sessionTable: InMemSessionDataTable,
    row: VuuDataRow,
    message: string,
  ) {
    const updatedRow = row.slice();
    updatedRow[sessionTable.columnMap.vuuMsg] = message;
    sessionTable.update(
      sessionTable.rowIndexAtKey(
        updatedRow[sessionTable.indexOfKeyField] as string,
      ),
      updatedRow,
    );
  }

  constructor(tableContainer: TableContainer) {
    super(tableContainer);
    this.registerRpc(RpcNames.EndEditSessionRpc, this.endEditSession);
  }
}
