import type {
  RpcResult,
  VuuColumnDataType,
  VuuDataRow,
  VuuRowDataItemType,
} from "@vuu-ui/vuu-protocol-types";
import { TableContainer } from "../../core/table/TableContainer";
import { DefaultRpcHandler } from "./DefaultRpcHandler";
import { RpcParams } from "./Rpc";
import { DataTable } from "../../core/table/InMemDataTable";
import { InMemSessionDataTable } from "../../core/table/InMemSessionDataTable";
import { RpcNames } from "../../util/RpcNames";
import type { Viewport } from "../../viewport/Viewport";
import type { RequestContext } from "../RequestProcessor";
import {
  coerceCellValue,
  isRowPermitted,
  isSystemColumn,
  permissionPredicate,
} from "./EditValidation";
import { getLogger } from "@heswell/service-utils";

const log = getLogger("vuu.rpc");

/**
 * A validated, type-coerced cell edit, passed to
 * {@link EditTableRpcHandler.validateCellEdit}.
 */
export type CellEdit = {
  column: string;
  ctx: RequestContext;
  dataType: VuuColumnDataType | undefined;
  key: string;
  /** the row after the edit */
  newRow: VuuDataRow;
  /** the row before the edit */
  row: VuuDataRow;
  /** the table being edited, a session table unless canEditSource allowed a direct edit */
  table: DataTable;
  value: VuuRowDataItemType;
  viewport: Viewport;
};

/**
 * Edit RPCs: editCell, addRow, deleteRow, deleteSelectedRows, undoRowChange.
 *
 * Secure by default:
 * - all edits target a session table owned by the requesting client
 *   session. Direct source table edits through editCell require
 *   {@link canEditSource} to be overridden.
 * - editCell only accepts known, non-key, non-system columns
 *   ({@link isEditableColumn}) and values matching the column type.
 * - rows hidden by the viewport's permission filter cannot be edited,
 *   deleted or restored, and are reported as not found.
 */
export class EditTableRpcHandler extends DefaultRpcHandler {
  /**
   * Opt in to editCell on a viewport that is NOT using a session table, i.e.
   * edits that write directly to the shared source table. Default false.
   */
  protected canEditSource(
    _viewport: Viewport,
    _column: string,
    _ctx: RequestContext,
  ): boolean {
    return false;
  }

  /**
   * Whether column may be edited through editCell. Called only for columns
   * that exist in the table. The key column and the server-maintained
   * system columns (vuuCreatedTimestamp, vuuUpdatedTimestamp, vuuMsg,
   * vuu_action) are not editable by default. vuu_action is never editable.
   */
  protected isEditableColumn(
    table: DataTable,
    column: string,
    _viewport: Viewport,
    _ctx: RequestContext,
  ): boolean {
    return column !== table.schema.key && !isSystemColumn(column);
  }

  /**
   * Business validation of a cell edit, after column, type and permission
   * checks. Return an error message to refuse the edit.
   */
  protected validateCellEdit(_edit: CellEdit): string | undefined | void {
    return undefined;
  }

  /**
   * Persist a validated edit. Join services can write through to a source
   * table instead of mutating the materialized join.
   */
  protected applyCellEdit({ table, key, newRow, column }: CellEdit): void {
    table.update(table.rowIndexAtKey(key), newRow, column);
  }

  /**
   * true if the row with key is visible to the viewport user. For session
   * tables the SOURCE row is checked against the permission filter of the
   * viewport the session was created from. Rows added in the session have
   * no source row and are always accessible.
   */
  protected isRowAccessible(viewport: Viewport, key: string): boolean {
    return this.rowAccessChecker(viewport)(key);
  }

  protected rowAccessChecker(viewport: Viewport): (key: string) => boolean {
    const table = viewport.dataTable;
    if (table instanceof InMemSessionDataTable) {
      const sourceTable = this.getSourceTable(table);
      const predicate = permissionPredicate(
        table.sourcePermissionFilter ?? viewport.permissionFilter,
        sourceTable.columnMap,
      );
      return (key) => {
        if (typeof key !== "string") return false;
        const sessionRow = table.getRowAtKey(key, false);
        if (sessionRow === undefined) return false;
        const sourceRow = sourceTable.getRowAtKey(key, false);
        if (sourceRow === undefined) {
          // added in this session, or deleted from the source since the
          // session was created (the save will report it as stale)
          return true;
        }
        return isRowPermitted(predicate, sourceRow);
      };
    } else {
      const predicate = permissionPredicate(
        viewport.permissionFilter,
        table.columnMap,
      );
      return (key) =>
        typeof key === "string" &&
        isRowPermitted(predicate, table.getRowAtKey(key, false));
    }
  }

  /** Validate without mutation, allowing services to prepare multi-cell edits. */
  protected prepareCellEdit(
    { namedParams, viewport, ctx }: RpcParams,
    pendingRow?: VuuDataRow,
  ): CellEdit {
    const { column, data, key } = namedParams as {
      column: string;
      data: VuuRowDataItemType;
      key: string;
    };
    log.debug(`editCell ${viewport.id} ${key} ${column}`);

    const table = viewport.dataTable;
    const isSessionTable = table instanceof InMemSessionDataTable;
    if (isSessionTable) {
      this.assertSessionOwner(table, ctx, "editCell");
    } else if (!this.canEditSource(viewport, column, ctx)) {
      throw Error(
        "editCell: viewport is not using a session table, direct edits are not permitted",
      );
    }

    const columnIndex =
      typeof column === "string" ? table.columnMap[column] : undefined;
    if (columnIndex === undefined) {
      throw Error(`editCell: column ${column} not found`);
    }
    if (column === "vuu_action") {
      throw Error("editCell: vuu_action is server controlled");
    }
    if (!this.isEditableColumn(table, column, viewport, ctx)) {
      throw Error(`editCell: column ${column} is not editable`);
    }

    const dataType = table.schema.columns.find(
      ({ name }) => name === column,
    )?.serverDataType;
    let value: VuuRowDataItemType;
    try {
      value = coerceCellValue(data, dataType, column);
    } catch (error) {
      throw Error(`editCell: ${(error as Error).message}`);
    }

    const row =
      typeof key === "string" ? table.getRowAtKey(key, false) : undefined;
    if (row === undefined || !this.isRowAccessible(viewport, key)) {
      throw Error(`editCell: row ${key} not found`);
    }

    const newRow = (pendingRow ?? row).slice();
    newRow[columnIndex] = value;

    if (!isSessionTable) {
      // a direct edit must not move the row out of the user's permissions
      const predicate = permissionPredicate(
        viewport.permissionFilter,
        table.columnMap,
      );
      if (!isRowPermitted(predicate, newRow)) {
        throw Error(
          `editCell: edit would make row ${key} inaccessible to the user`,
        );
      }
      const tsIndex = table.columnMap.vuuUpdatedTimestamp;
      if (tsIndex !== undefined) newRow[tsIndex] = Date.now();
    }

    const edit: CellEdit = {
      column,
      ctx,
      dataType,
      key,
      newRow,
      row,
      table,
      value,
      viewport,
    };
    const validationError = this.validateCellEdit(edit);
    if (validationError) {
      throw Error(validationError);
    }

    return edit;
  }

  editCell = (params: RpcParams): RpcResult => {
    try {
      this.applyCellEdit(this.prepareCellEdit(params));
      return { type: "SUCCESS_RESULT", data: undefined };
    } catch (error) {
      return this.errorResult(error);
    }
  };

  addRow = ({ namedParams, viewport, ctx }: RpcParams): RpcResult => {
    const { data, key } = namedParams as {
      data: Record<string, VuuRowDataItemType>;
      key?: string;
    };

    try {
      const sessionTable = this.requireSessionTable(viewport, ctx, "addRow");
      const rowKey = key ?? crypto.randomUUID();
      const sourceTable = this.getSourceTable(sessionTable);
      if (sourceTable.getRowAtKey(rowKey, false)) {
        throw Error(`addRow: row ${rowKey} already exists in source table`);
      }
      sessionTable.addSessionRow(data, rowKey);
      return {
        type: "SUCCESS_RESULT",
        data: { key: rowKey },
      };
    } catch (error) {
      return this.errorResult(error);
    }
  };

  deleteRow = ({ namedParams, viewport, ctx }: RpcParams): RpcResult => {
    const { key } = namedParams as { key: string };

    try {
      const sessionTable = this.requireSessionTable(viewport, ctx, "deleteRow");
      if (!this.isRowAccessible(viewport, key)) {
        throw Error(`deleteRow: row ${key} not found`);
      }
      sessionTable.markRowDeleted(key);
      return { type: "SUCCESS_RESULT", data: undefined };
    } catch (error) {
      return this.errorResult(error);
    }
  };

  deleteSelectedRows = ({ viewport, ctx }: RpcParams): RpcResult => {
    const deletedKeys: string[] = [];

    try {
      const sessionTable = this.requireSessionTable(
        viewport,
        ctx,
        "deleteSelectedRows",
      );
      const canAccess = this.rowAccessChecker(viewport);
      const selectedKeys = Array.from(viewport.selectedKeys);
      for (const key of selectedKeys) {
        if (!canAccess(key)) {
          throw Error(`deleteSelectedRows: row ${key} not found`);
        }
      }
      for (const key of selectedKeys) {
        sessionTable.markRowDeleted(key);
        deletedKeys.push(key);
      }
      return { type: "SUCCESS_RESULT", data: { deletedKeys } };
    } catch (error) {
      return this.errorResult(error);
    }
  };

  undoRowChange = ({ namedParams, viewport, ctx }: RpcParams): RpcResult => {
    const { key } = namedParams as { key: string };

    try {
      const sessionTable = this.requireSessionTable(
        viewport,
        ctx,
        "undoRowChange",
      );
      if (!this.isRowAccessible(viewport, key)) {
        throw Error(`undoRowChange: row ${key} not found`);
      }
      sessionTable.undoRowChange(key, this.getSourceTable(sessionTable));
      return { type: "SUCCESS_RESULT", data: undefined };
    } catch (error) {
      return this.errorResult(error);
    }
  };

  protected getSourceTable(sessionTable: InMemSessionDataTable) {
    return this.tableContainer.getTable<DataTable>(sessionTable.tableDef.name);
  }

  /**
   * Throws unless the viewport is using a session table owned by the
   * requesting client session.
   */
  protected requireSessionTable(
    viewport: Viewport,
    ctx: RequestContext | undefined,
    rpcName: string,
  ): InMemSessionDataTable {
    const table = viewport.dataTable;
    if (table instanceof InMemSessionDataTable) {
      this.assertSessionOwner(table, ctx, rpcName);
      return table;
    }
    throw Error(`${rpcName}: viewport is not using a session table`);
  }

  private assertSessionOwner(
    table: InMemSessionDataTable,
    ctx: RequestContext | undefined,
    rpcName: string,
  ) {
    if (ctx?.session?.sessionId !== table.ownerSessionId) {
      throw Error(`${rpcName}: session table not found`);
    }
  }

  protected errorResult(error: unknown): RpcResult {
    // messages name rows and columns, never cell values
    log.debug(`edit refused: ${(error as Error).message}`);
    return {
      type: "ERROR_RESULT",
      errorMessage: (error as Error).message,
    };
  }

  constructor(tableContainer: TableContainer) {
    super(tableContainer);
    this.registerRpc(RpcNames.AddRowRpc, this.addRow);
    this.registerRpc(RpcNames.DeleteRowRpc, this.deleteRow);
    this.registerRpc(RpcNames.DeleteSelectedRowsRpc, this.deleteSelectedRows);
    this.registerRpc(RpcNames.EditCellRpc, this.editCell);
    this.registerRpc(RpcNames.UndoRowChangeRpc, this.undoRowChange);
  }
}
