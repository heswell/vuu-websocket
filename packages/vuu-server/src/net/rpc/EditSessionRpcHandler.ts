import { RpcResult } from "@vuu-ui/vuu-protocol-types";
import { TableContainer } from "../../core/table/TableContainer";
import { EditTableRpcHandler } from "./EditTableRpcHandler";
import { RpcParams } from "./Rpc";
import { DataTable } from "../../core/table/InMemDataTable";
import { RequestContext } from "../RequestProcessor";
import { Viewport } from "../../viewport/Viewport";
import { InMemSessionDataTable } from "../../core/table/InMemSessionDataTable";

export type EditSessionMode =
  | "inline-all-rows"
  | "all-rows"
  | "selected-rows"
  | "no-rows";
export class EditSessionRpcHandler extends EditTableRpcHandler {
  beginEditSession = ({ namedParams, viewport, ctx }: RpcParams): RpcResult => {
    console.log(
      `beginEditSession ${JSON.stringify(namedParams)} ${JSON.stringify(namedParams)}`,
    );

    const { editSessionMode } = namedParams as { editSessionMode: string };
    const baseTable = viewport.dataTable;
    const sessionTable = this.createSessionTable(
      baseTable,
      editSessionMode,
      ctx,
      viewport,
    );
    const { module } = sessionTable.schema.table;
    return {
      type: "SUCCESS_RESULT",
      data: {
        table: { module, table: sessionTable.name },
      },
    };
  };

  endEditSession = ({
    namedParams: { force, save },
    viewport,
    ctx,
  }: RpcParams): RpcResult => {
    const sessionTable = viewport.dataTable;
    const sourceTable = this.tableContainer.getTable(
      sessionTable.tableDef.name,
    );

    if (save) {
      let rejectedCount = 0;

      if (sessionTable instanceof InMemSessionDataTable) {
        const updates = sessionTable.getSessionUpdates();
        const { columnMap } = sourceTable;
        updates.forEach((rowUpdates, key) => {
          const { cellUpdates, lastUpdateTimestamp } = rowUpdates;
          const currentRow = sourceTable.getRowAtKey(key);
          if (currentRow) {
            const updateTimestampOnTable =
              currentRow[columnMap.vuuUpdatedTimestamp];
            if (lastUpdateTimestamp !== updateTimestampOnTable && !force) {
              // We will reject updates for this row, update session table row with message
              rejectedCount += 1;
              const rowIdx = sessionTable.rowIndexAtKey(key);
              const sessionTableRow = sessionTable.getRowAtKey(key);
              const newRow = sessionTableRow.slice();
              const messages: string[] = [];
              Object.entries(cellUpdates).forEach(([column, value]) => {
                const updatedValue = currentRow[columnMap[column]];
                messages.push(
                  `${column}:${value}:${updatedValue}:${updateTimestampOnTable}`,
                );
              });
              newRow[sessionTable.columnMap.vuuMsg] = messages.join(",");
              sessionTable.update(rowIdx, newRow);
            } else {
              const newRow = currentRow.slice();
              const rowIdx = sourceTable.rowIndexAtKey(key);
              Object.entries(cellUpdates).forEach(([column, value]) => {
                newRow[columnMap[column]] = value;
              });
              newRow[columnMap.vuuUpdatedTimestamp] = Date.now();
              sourceTable.update(rowIdx, newRow);
            }
          } else {
          }
        });
      } else {
        for (const row of sessionTable.rows) {
          const rowKey = row[sourceTable.indexOfKeyField] as string;
          const rowIdx = sourceTable.rowIndexAtKey(rowKey);
          sourceTable.update(rowIdx, row);
        }
      }
      // vuu server relies on removeSessionTables at end of user session
      // this.tableContainer.removeSessionTable(sessionTable.name);
      if (rejectedCount > 0) {
        return {
          errorMessage: "stale update",
          type: "ERROR_RESULT",
        };
      } else {
        if (sessionTable instanceof InMemSessionDataTable) {
          this.tableContainer.removeSessionTable(sessionTable.name);
          return {
            type: "SUCCESS_RESULT",
            data: undefined,
          };
        } else {
          throw Error("wtf");
        }
      }
    } else {
      return {
        type: "SUCCESS_RESULT",
        data: {},
      };
    }
  };

  private createSessionTable(
    baseTable: DataTable,
    editSessionMode: string,
    ctx: RequestContext,
    viewport: Viewport,
  ) {
    if (editSessionMode.endsWith("all-rows")) {
      console.time(
        "[EditSessionRpcHandler] create session table with all rows",
      );
      // maybe ony if rowCount > threshold
      const sessionTable = this.tableContainer.createSimpleSessionTable(
        baseTable,
        ctx.session,
      );
      baseTable.rows.forEach((row) => {
        (sessionTable.insert(row.slice()), false);
      });
      console.timeEnd(
        "[EditSessionRpcHandler] create session table with all rows",
      );
      return sessionTable;
    } else if (editSessionMode === "selected-rows") {
      const sessionTable = this.tableContainer.createSimpleSessionTable(
        baseTable,
        ctx.session,
      );

      const { selectedKeys } = viewport;
      selectedKeys.forEach((key) => {
        console.log(`add selected row ${key}`);
        const row = baseTable.getRowAtKey(key);
        (sessionTable.insert(row), false);
      });

      return sessionTable;
    } else if (editSessionMode === "empty-session-table") {
      return this.tableContainer.createSimpleSessionTable(
        baseTable,
        ctx.session,
      );
    } else {
      throw Error(
        `[EditSessionRpcHandler] invalid editSessionMode ${editSessionMode}`,
      );
    }
  }

  constructor(tableContainer: TableContainer) {
    super(tableContainer);
    this.registerRpc("beginEditSession", this.beginEditSession);
    this.registerRpc("endEditSession", this.endEditSession);
  }
}
