import type {
  RpcResult,
  VuuColumnDataType,
  VuuRowDataItemType,
} from "@vuu-ui/vuu-protocol-types";
import type { Table, TableRow } from "../../Table";
import type { VuuModuleUser } from "../user/CurrentUser";

/**
 * Engine-maintained columns. Not editable through editCell by default.
 */
export const VUU_SYSTEM_COLUMNS: ReadonlySet<string> = new Set([
  "vuuCreatedTimestamp",
  "vuuUpdatedTimestamp",
  "vuuMsg",
  "vuuAction",
]);

export const isSystemColumn = (column: string) =>
  VUU_SYSTEM_COLUMNS.has(column);

/**
 * endEditSession error when a source row changed after it was copied into
 * the session. vuu-ui's VuuDataSource matches this string exactly (and
 * throws StaleUpdateError), do not change it.
 */
export const STALE_UPDATE = "stale update";
export const DUPLICATE_KEY = "duplicate key";
export const SAVE_NOT_PERMITTED = "endEditSession: save not permitted";
export const SAVE_FAILED = "endEditSession: save failed";

/**
 * Passed to every edit hook.
 */
export interface EditContext {
  moduleName: string;
  /** The source table name (never the session table name). */
  tableName: string;
  /** The viewport that made the request. */
  viewportId: string;
  /** The user that owns the viewport. */
  user: VuuModuleUser;
  /** The session table, when the request targets an edit session. */
  sessionTable?: Table;
  sessionTableName?: string;
}

export type SessionTableAction = "addRow" | "editCell" | "deleteRow";

export type SessionRowChange = {
  action: SessionTableAction;
  /**
   * Changed source columns and their new values. For addRow, every source
   * column. Empty for deleteRow.
   */
  cellUpdates: Record<string, VuuRowDataItemType>;
  key: string;
  /** The session row, projected onto the source table's columns. */
  row: TableRow;
  /** The session row, as stored in the session table. */
  sessionRow: TableRow;
  /**
   * Copy of the source row taken when it was copied into the session (or
   * when a change was undone). Used to detect concurrent source changes.
   */
  sourceSnapshot?: TableRow;
};

export type PreparedSessionChange = SessionRowChange & {
  /** The current source row (absent for addRow). */
  sourceRow?: TableRow;
};

export type PreparedSessionSave = {
  sourceTable: Table;
  sessionTable: Table;
  changes: PreparedSessionChange[];
};

/** true permits the save, false or a string (the reason) refuses it. */
export type CanSaveSessionResult = boolean | string;

/**
 * undefined, true or a SUCCESS_RESULT mean the save succeeded. false or an
 * ERROR_RESULT (as does a thrown error) mean it failed; the session is left
 * open so the user can retry or cancel.
 */
export type SessionSaveResult = void | boolean | RpcResult;

/** A cell edit, passed to `validateCellEdit`. */
export type CellEdit = {
  column: string;
  ctx: EditContext;
  dataType: VuuColumnDataType | undefined;
  key: string;
  /** the row after the edit */
  newRow: TableRow;
  /** the row before the edit */
  row: TableRow;
  /** the table being edited, the session table unless editing the source directly */
  table: Table;
  value: VuuRowDataItemType;
};

/**
 * Edit and session-save hooks. Implement them as protected methods of a
 * VuuModule (applying to every table), or per table via
 * `VuuModule.editHooks`, which take precedence.
 */
export interface EditHooks {
  /**
   * Opt in to editCell on a viewport that is NOT using a session table, i.e.
   * edits written directly to the source table. Default true (unlike
   * vuu-server) for backward compatibility.
   */
  canEditSource?: (column: string, ctx: EditContext) => boolean;
  /**
   * Whether a column may be edited through editCell. Default: any column
   * except the key and the system columns.
   */
  isEditableColumn?: (
    table: Table,
    column: string,
    ctx: EditContext,
  ) => boolean;
  /** Return an error message to refuse a cell edit. */
  validateCellEdit?: (edit: CellEdit) => string | undefined | void;
  /**
   * Names of the source columns that changed since the row was copied into
   * the session. A non-empty result makes the save fail with "stale update".
   */
  getStaleColumns?: (
    sourceTable: Table,
    sourceRow: TableRow,
    change: SessionRowChange,
  ) => string[];
  /**
   * Authorise a save, after changes are prepared (and found not stale),
   * before applySessionSave. Return false or a reason to refuse.
   */
  canSaveSession?: (
    prepared: PreparedSessionSave,
    ctx: EditContext,
  ) => CanSaveSessionResult | Promise<CanSaveSessionResult>;
  /**
   * Apply prepared changes. Default {@link defaultApplySessionSave}, an
   * atomic write to the source table. Override to route changes elsewhere
   * (e.g. to an order service); call `defaultApplySessionSave` for any
   * changes that should still be written to the source table.
   */
  applySessionSave?: (
    sessionTable: Table,
    prepared: PreparedSessionSave,
    ctx: EditContext,
  ) => SessionSaveResult | Promise<SessionSaveResult>;
}

export const defaultCanEditSource = () => true;

export const defaultIsEditableColumn = (table: Table, column: string) =>
  column !== table.schema.key && !isSystemColumn(column);

/**
 * Compares the current source row with the snapshot taken when the row was
 * copied into the session. For editCell, only the columns edited in the
 * session are compared (other columns, e.g. ticking prices, are not written
 * by the save so cannot conflict). For deleteRow, every column is compared.
 * Without a snapshot (e.g. a row added to an empty session), nothing is
 * reported as stale.
 */
export const defaultGetStaleColumns = (
  sourceTable: Table,
  sourceRow: TableRow,
  { action, cellUpdates, sourceSnapshot }: SessionRowChange,
): string[] => {
  if (!sourceSnapshot || action === "addRow") {
    return [];
  }
  const { map } = sourceTable;
  const columns =
    action === "editCell"
      ? Object.keys(cellUpdates)
      : sourceTable.schema.columns.map(({ name }) => name);
  return columns.filter(
    (name) => !Object.is(sourceSnapshot[map[name]], sourceRow[map[name]]),
  );
};

/**
 * Writes prepared changes to the source table. Atomic: if any change
 * throws, changes already applied are rolled back and the error rethrown.
 */
export const defaultApplySessionSave = (
  _sessionTable: Table,
  {
    sourceTable,
    changes,
  }: Pick<PreparedSessionSave, "sourceTable" | "changes">,
): SessionSaveResult => {
  const undo: Array<() => void> = [];
  try {
    for (const { action, cellUpdates, key, row } of changes) {
      const previousRow = sourceTable.findByKey(key)?.slice();
      if (action === "addRow") {
        if (previousRow) {
          throw Error(`addRow:${key}:key already exists`);
        }
        sourceTable.insert(row.slice());
        undo.push(() => sourceTable.delete(key));
      } else if (action === "deleteRow") {
        if (previousRow) {
          sourceTable.delete(key);
          undo.push(() => sourceTable.engineTable.insert(previousRow as never));
        }
      } else if (previousRow) {
        const updatedRow = previousRow.slice();
        for (const [column, value] of Object.entries(cellUpdates)) {
          updatedRow[sourceTable.map[column]] = value;
        }
        sourceTable.updateRow(updatedRow);
        undo.push(() => sourceTable.updateRow(previousRow));
      } else {
        throw Error(`editCell:${key}:source row missing`);
      }
    }
  } catch (error) {
    for (const undoChange of undo.reverse()) {
      try {
        undoChange();
      } catch {
        // best effort
      }
    }
    throw error;
  }
};
