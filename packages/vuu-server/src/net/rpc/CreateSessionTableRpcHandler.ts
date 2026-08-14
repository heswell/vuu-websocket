import { RpcResult } from "@vuu-ui/vuu-protocol-types";
import { TableContainer } from "../../core/table/TableContainer";
import { DataTable } from "../../core/table/InMemDataTable";
import { RequestContext } from "../RequestProcessor";
import { Viewport } from "../../viewport/Viewport";
import { EndEditSessionRpcHandler } from "./EndEditSessionRpcHandler";
import { RpcParams } from "./Rpc";
import { RpcNames } from "../../util/RpcNames";

export type SessionTableCopyOption = "All" | "Empty" | "Selected";
export type EditSessionMode =
  | "inline-all-rows"
  | "all-rows"
  | "selected-rows"
  | "empty-session-table"
  | "no-rows";

export class CreateSessionTableRpcHandler extends EndEditSessionRpcHandler {
  createSessionTable = ({
    namedParams,
    viewport,
    ctx,
  }: RpcParams): RpcResult => {
    const { copyOption } = namedParams as {
      copyOption: SessionTableCopyOption;
    };
    return this.createSessionTableResult(
      viewport.dataTable,
      copyOption,
      ctx,
      viewport,
    );
  };

  beginEditSession = ({
    namedParams,
    viewport,
    ctx,
  }: RpcParams): RpcResult => {
    const { editSessionMode = "inline-all-rows" } = namedParams as {
      editSessionMode?: EditSessionMode;
    };
    return this.createSessionTableResult(
      viewport.dataTable,
      editSessionMode,
      ctx,
      viewport,
    );
  };

  private createSessionTableResult(
    sourceTable: DataTable,
    copyOption: SessionTableCopyOption | EditSessionMode,
    ctx: RequestContext,
    viewport: Viewport,
  ): RpcResult {
    try {
      const sessionTable = this.copySessionTable(
        sourceTable,
        copyOption,
        ctx,
        viewport,
      );
      const { module } = sessionTable.schema.table;
      return {
        type: "SUCCESS_RESULT",
        data: {
          module,
          sessionTable: sessionTable.name,
          table: { module, table: sessionTable.name },
        },
      };
    } catch (error) {
      return {
        type: "ERROR_RESULT",
        errorMessage: (error as Error).message,
      };
    }
  }

  private copySessionTable(
    sourceTable: DataTable,
    copyOption: SessionTableCopyOption | EditSessionMode,
    ctx: RequestContext,
    viewport: Viewport,
  ) {
    const sessionTable = this.tableContainer.createSimpleSessionTable(
      sourceTable,
      ctx.session,
    );

    try {
      if (copyOption === "All" || copyOption.endsWith("all-rows")) {
        sourceTable.rows.forEach((row) => sessionTable.insertSourceRow(row));
      } else if (
        copyOption === "Selected" ||
        copyOption === "selected-rows"
      ) {
        viewport.selectedKeys.forEach((key) => {
          sessionTable.insertSourceRow(sourceTable.getRowAtKey(key));
        });
      } else if (
        copyOption !== "Empty" &&
        copyOption !== "empty-session-table" &&
        copyOption !== "no-rows"
      ) {
        throw Error(`createSessionTable: invalid copyOption ${copyOption}`);
      }
    } catch (error) {
      this.tableContainer.removeSessionTable(sessionTable.name);
      throw error;
    }

    return sessionTable;
  }

  constructor(tableContainer: TableContainer) {
    super(tableContainer);
    this.registerRpc(RpcNames.BeginEditSessionRpc, this.beginEditSession);
    this.registerRpc(RpcNames.CreateSessionTableRpc, this.createSessionTable);
  }
}
