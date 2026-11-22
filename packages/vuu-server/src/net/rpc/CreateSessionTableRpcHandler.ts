import {
  RpcResult,
  VuuDataRow,
  VuuRowDataItemType,
} from "@vuu-ui/vuu-protocol-types";
import { getLogger } from "@heswell/service-utils/browser";
import { TableContainer } from "../../core/table/TableContainer";
import { DataTable } from "../../core/table/InMemDataTable";
import { RequestContext } from "../RequestProcessor";
import { Viewport } from "../../viewport/Viewport";
import { EndEditSessionRpcHandler } from "./EndEditSessionRpcHandler";
import { RpcParams } from "./Rpc";
import { RpcNames } from "../../util/RpcNames";
import { VUU_DEFAULT_COLUMNS, type Column } from "../../api/TableDef";
import { InMemSessionDataTable } from "../../core/table/InMemSessionDataTable";
import { isRowPermitted, permissionPredicate } from "./EditValidation";

const log = getLogger("vuu.rpc");

export type SessionTableCopyOption = "All" | "Empty" | "Selected";
export type SessionType = "edit" | "import" | "export";
export type EditSessionMode =
  | "inline-all-rows"
  | "all-rows"
  | "selected-rows"
  | "empty-session-table"
  | "no-rows";

/** Named params of the createSessionTable RPC, as in Scala Vuu. */
export type CreateSessionTableParams = {
  /**
   * Comma separated names of the source columns to copy, or "*". Default:
   * the source columns, excluding the default columns (vuuCreatedTimestamp,
   * vuuUpdatedTimestamp, vuuMsg).
   */
  columnsToCopy?: string;
  /** Required for "edit" and "export". "import" always uses "Empty". */
  copyOption?: SessionTableCopyOption;
  /**
   * Name of the session table blueprint, registered with
   * ModuleFactory.addSessionTable. Default `<sessionType>-<sourceTable>`.
   */
  sessionTableName?: string;
  sessionType?: SessionType;
};

const SESSION_TYPES: readonly SessionType[] = ["edit", "import", "export"];
const COPY_OPTIONS: readonly SessionTableCopyOption[] = [
  "All",
  "Empty",
  "Selected",
];
const DEFAULT_COLUMN_NAMES = new Set(VUU_DEFAULT_COLUMNS.map(({ name }) => name));

const isSessionType = (value: unknown): value is SessionType =>
  SESSION_TYPES.includes(value as SessionType);
const isCopyOption = (value: unknown): value is SessionTableCopyOption =>
  COPY_OPTIONS.includes(value as SessionTableCopyOption);

const editSessionModeToCopyOption = (
  editSessionMode: EditSessionMode | string,
): SessionTableCopyOption | undefined => {
  switch (editSessionMode) {
    case "inline-all-rows":
    case "all-rows":
      return "All";
    case "selected-rows":
      return "Selected";
    case "empty-session-table":
    case "no-rows":
      return "Empty";
  }
};

const errorResult = (errorMessage: string): RpcResult => ({
  type: "ERROR_RESULT",
  errorMessage,
});

class CreateSessionTableError extends Error {}

/**
 * createSessionTable, as in Scala Vuu: creates a session table, owned by the
 * requesting client session, from a session table blueprint registered with
 * `ModuleFactory.addSessionTable`. The blueprint is selected by the
 * `sessionTableName` param, default `<sessionType>-<sourceTable>`. There is
 * no fallback, if no blueprint is registered under that name the RPC fails.
 *
 * Viewports on the session table use the blueprint's ServiceFactory, so the
 * blueprint's RpcHandler serves the edit RPCs and endEditSession.
 *
 * Also registers beginEditSession, the legacy UI API, kept only for backward
 * compatibility. It works as it always has: the session table is derived
 * from the source table's definition (no blueprint and no `editable` flag are
 * needed) and viewports on it use the source table's service. It does not
 * support session table blueprints, use createSessionTable for those.
 */
export class CreateSessionTableRpcHandler extends EndEditSessionRpcHandler {
  /** Maximum number of rows copied into a session table. */
  protected maxSessionTableSize = 10_000;

  createSessionTable = ({
    namedParams,
    viewport,
    ctx,
  }: RpcParams): RpcResult => {
    const { sessionType, ...params } = namedParams as CreateSessionTableParams;
    if (!isSessionType(sessionType)) {
      return errorResult("Session type undefined");
    }
    return this.createSessionTableResult(viewport, sessionType, params, ctx);
  };

  beginEditSession = ({
    namedParams,
    viewport,
    ctx,
  }: RpcParams): RpcResult => {
    const { editSessionMode = "inline-all-rows" } = namedParams as {
      editSessionMode?: EditSessionMode;
    };
    const copyOption = editSessionModeToCopyOption(editSessionMode);
    if (copyOption === undefined) {
      return errorResult(
        `createSessionTable: invalid copyOption ${editSessionMode}`,
      );
    }
    try {
      return this.sessionTableResult(
        this.copyLegacySessionTable(viewport, copyOption, ctx),
      );
    } catch (error) {
      return errorResult((error as Error).message);
    }
  };

  /**
   * Columns added to a session table created by the legacy beginEditSession.
   * Default none.
   * @deprecated define the columns on a session table blueprint instead.
   */
  protected getSessionTableCustomColumns(_sourceTable: DataTable): Column[] {
    return [];
  }

  /**
   * Whether the user may create a session table of sessionType "edit" or
   * "import" (export is not checked, as in Scala Vuu). Default true.
   */
  protected isCreateSessionTableAllowed(
    _sessionType: Exclude<SessionType, "export">,
    _ctx: RequestContext,
  ): boolean {
    return true;
  }

  /**
   * Customise the values of a row copied from the source table into the
   * session table, keyed by column name. Called when the session is created
   * and when a row change is undone. Default returns data unchanged.
   */
  protected customiseRowData(
    _viewport: Viewport,
    data: Record<string, VuuRowDataItemType>,
    _sourceRow: VuuDataRow,
  ): Record<string, VuuRowDataItemType> {
    return data;
  }

  private createSessionTableResult(
    viewport: Viewport,
    sessionType: SessionType,
    { columnsToCopy, copyOption, sessionTableName }: CreateSessionTableParams,
    ctx: RequestContext,
  ): RpcResult {
    try {
      const sessionTable = this.copySessionTable(
        viewport,
        sessionType,
        sessionType === "import" ? "Empty" : copyOption,
        sessionTableName,
        columnsToCopy,
        ctx,
      );
      return this.sessionTableResult(sessionTable);
    } catch (error) {
      if (!(error instanceof CreateSessionTableError)) {
        log.warn(`createSessionTable failed, ${(error as Error).message}`);
      }
      return errorResult((error as Error).message);
    }
  }

  private sessionTableResult(sessionTable: InMemSessionDataTable): RpcResult {
    const { module } = sessionTable.schema.table;
    return {
      type: "SUCCESS_RESULT",
      data: {
        module,
        sessionTable: sessionTable.name,
        table: { module, table: sessionTable.name },
      },
    };
  }

  /**
   * The legacy beginEditSession: copies the permitted source rows into a
   * session table derived from the source table's definition.
   */
  private copyLegacySessionTable(
    viewport: Viewport,
    copyOption: SessionTableCopyOption,
    ctx: RequestContext,
  ) {
    const sourceTable = viewport.dataTable;
    if (sourceTable instanceof InMemSessionDataTable) {
      throw Error(
        "createSessionTable: viewport is already using a session table",
      );
    }
    const { permissionFilter } = viewport;
    const isVisible = permissionPredicate(
      permissionFilter,
      sourceTable.columnMap,
    );
    const sessionTable = this.tableContainer.createLegacySessionTable(
      sourceTable,
      ctx.session,
      this.getSessionTableCustomColumns(sourceTable),
    );
    sessionTable.sourcePermissionFilter = permissionFilter;
    sessionTable.copiedColumns = sourceTable.schema.columns.map(
      ({ name }) => name,
    );
    try {
      const { indexOfKeyField } = sourceTable;
      const copyRow = (row: VuuDataRow | undefined) => {
        if (row && isRowPermitted(isVisible, row)) {
          sessionTable.insertSourceRow(row[indexOfKeyField] as string, row);
        }
      };
      if (copyOption === "All") {
        sourceTable.rows.forEach(copyRow);
      } else if (copyOption === "Selected") {
        // keys that are not (or no longer) visible are ignored
        viewport.selectedKeys.forEach((key) =>
          copyRow(sourceTable.getRowAtKey(key, false)),
        );
      }
    } catch (error) {
      this.tableContainer.removeSessionTable(sessionTable.name);
      throw error;
    }
    return sessionTable;
  }

  /**
   * Copies source rows into a new instance of the session table blueprint.
   * Only rows visible through the viewport's permission filter are copied,
   * the filter is retained by the session table and applied to subsequent
   * edits and to the save.
   */
  private copySessionTable(
    viewport: Viewport,
    sessionType: SessionType,
    copyOption: SessionTableCopyOption | undefined,
    sessionTableName: string | undefined,
    columnsToCopy: string | undefined,
    ctx: RequestContext,
  ) {
    const sourceTable = viewport.dataTable;
    if (sourceTable instanceof InMemSessionDataTable) {
      throw new CreateSessionTableError(
        "createSessionTable: viewport is already using a session table",
      );
    }

    if (sessionType !== "export") {
      if (!this.isCreateSessionTableAllowed(sessionType, ctx)) {
        log.warn(
          `user ${ctx?.user?.name} does not have permission to call createSessionTable for ${sessionType}`,
        );
        throw new CreateSessionTableError(
          `No permission to create session table for ${sessionType}.`,
        );
      }
      if (!sourceTable.tableDef.editable) {
        log.warn(`table ${sourceTable.tableDef.name} is not editable`);
        throw new CreateSessionTableError("Table not editable");
      }
    }

    const blueprintName =
      typeof sessionTableName === "string" && sessionTableName !== ""
        ? sessionTableName
        : `${sessionType}-${sourceTable.tableDef.name}`;

    if (!isCopyOption(copyOption)) {
      throw new CreateSessionTableError("Missing or invalid copy option.");
    }

    const columns = this.getColumnsToCopy(sourceTable, columnsToCopy);

    let blueprint: DataTable;
    try {
      blueprint = this.tableContainer.getSessionTableBlueprint(blueprintName);
    } catch (error) {
      throw new CreateSessionTableError((error as Error).message);
    }

    const { permissionFilter } = viewport;
    const isVisible = permissionPredicate(
      permissionFilter,
      sourceTable.columnMap,
    );

    const sessionTable = this.tableContainer.createSimpleSessionTable(
      blueprint,
      ctx.session,
      sourceTable,
    );
    sessionTable.sourcePermissionFilter = permissionFilter;
    sessionTable.copiedColumns = columns;
    const defaultRowData = sessionTable.sourceRowData;
    sessionTable.sourceRowData = (sourceRow) =>
      this.customiseRowData(viewport, defaultRowData(sourceRow), sourceRow);

    try {
      const { indexOfKeyField } = sourceTable;
      let remaining = this.maxSessionTableSize;
      const copyRow = (row: VuuDataRow | undefined) => {
        if (remaining > 0 && row && isRowPermitted(isVisible, row)) {
          sessionTable.insertSourceRow(row[indexOfKeyField] as string, row);
          remaining -= 1;
        }
      };
      if (copyOption === "All") {
        for (const row of sourceTable.rows) {
          if (remaining === 0) break;
          copyRow(row);
        }
      } else if (copyOption === "Selected") {
        // keys that are not (or no longer) visible are ignored
        for (const key of viewport.selectedKeys) {
          if (remaining === 0) break;
          copyRow(sourceTable.getRowAtKey(key, false));
        }
      }
    } catch (error) {
      this.tableContainer.removeSessionTable(sessionTable.name);
      throw error;
    }

    if (sessionType === "export") {
      log.info(
        `export session table ${sessionTable.name} created for user ${ctx?.user?.name} in session ${ctx?.session?.sessionId} from source table ${sourceTable.name}, ${sessionTable.rows.length} rows`,
      );
    }

    return sessionTable;
  }

  private getColumnsToCopy(
    sourceTable: DataTable,
    columnsToCopy: string | undefined,
  ): string[] {
    const columns =
      typeof columnsToCopy !== "string" ||
      columnsToCopy.trim() === "" ||
      columnsToCopy.trim() === "*"
        ? sourceTable.tableDef.columns
            .map(({ name }) => name)
            .filter((name) => !DEFAULT_COLUMN_NAMES.has(name))
        : columnsToCopy.split(",").map((name) => name.trim());

    const missing = columns.filter(
      (name) => sourceTable.columnMap[name] === undefined,
    );
    if (missing.length > 0) {
      log.warn(
        `column(s) [${missing.join(", ")}] not found in table ${sourceTable.tableDef.name}`,
      );
      throw new CreateSessionTableError("Column(s) not found in source table.");
    }
    return columns;
  }

  constructor(tableContainer: TableContainer) {
    super(tableContainer);
    this.registerRpc(RpcNames.BeginEditSessionRpc, this.beginEditSession);
    this.registerRpc(RpcNames.CreateSessionTableRpc, this.createSessionTable);
  }
}
