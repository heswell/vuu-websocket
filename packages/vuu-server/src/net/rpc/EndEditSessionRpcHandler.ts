import { RpcResult } from "@vuu-ui/vuu-protocol-types";
import { TableContainer } from "../../core/table/TableContainer";
import { InMemSessionDataTable } from "../../core/table/InMemSessionDataTable";
import { EditTableRpcHandler } from "./EditTableRpcHandler";
import { RpcParams } from "./Rpc";
import { RpcNames } from "../../util/RpcNames";

export class EndEditSessionRpcHandler extends EditTableRpcHandler {
  endEditSession = ({
    namedParams: { force, save },
    viewport,
  }: RpcParams): RpcResult => {
    const sessionTable = viewport.dataTable;
    if (!(sessionTable instanceof InMemSessionDataTable)) {
      return {
        type: "ERROR_RESULT",
        errorMessage: "endEditSession: viewport is not using a session table",
      };
    }

    if (!save) {
      this.tableContainer.removeSessionTable(sessionTable.name);
      return { type: "SUCCESS_RESULT", data: undefined };
    }

    const sourceTable = this.tableContainer.getTable(
      sessionTable.tableDef.name,
    );
    const { columnMap } = sourceTable;
    let rejectedCount = 0;
    let duplicateKeyCount = 0;

    for (const sessionRow of sessionTable.rows) {
      if (sessionTable.getAction(sessionRow) !== "addRow") {
        continue;
      }
      const key = sessionRow[sessionTable.indexOfKeyField] as string;
      if (sourceTable.getRowAtKey(key, false)) {
        const newRow = sessionRow.slice();
        newRow[sessionTable.columnMap.vuuMsg] =
          `addRow:${key}:key already exists`;
        sessionTable.update(sessionTable.rowIndexAtKey(key), newRow);
        duplicateKeyCount += 1;
      }
    }

    if (duplicateKeyCount > 0) {
      return {
        errorMessage: "duplicate key",
        type: "ERROR_RESULT",
      };
    }

    sessionTable.getSessionUpdates().forEach((rowUpdates, key) => {
      const sessionRow = sessionTable.getRowAtKey(key, false);
      if (!sessionRow) {
        return;
      }

      const currentRow = sourceTable.getRowAtKey(key, false);
      if (!currentRow) {
        const newRow = sessionRow.slice();
        const action = sessionTable.getAction(sessionRow) || "editRow";
        newRow[sessionTable.columnMap.vuuMsg] =
          `${action}:${key}:source row missing`;
        sessionTable.update(sessionTable.rowIndexAtKey(key), newRow);
        rejectedCount += 1;
        return;
      }

      const { cellUpdates, lastUpdateTimestamp } = rowUpdates;
      const updateTimestampOnTable =
        currentRow[columnMap.vuuUpdatedTimestamp];
      if (lastUpdateTimestamp !== updateTimestampOnTable && !force) {
        rejectedCount += 1;
        const newRow = sessionRow.slice();
        const messages = Object.entries(cellUpdates).map(([column, value]) => {
          const updatedValue = currentRow[columnMap[column]];
          return `${column}:${value}:${updatedValue}:${updateTimestampOnTable}`;
        });
        if (sessionTable.getAction(sessionRow) === "deleteRow") {
          messages.push(`deleteRow:${key}:${updateTimestampOnTable}`);
        }
        newRow[sessionTable.columnMap.vuuMsg] = messages.join(",");
        sessionTable.update(sessionTable.rowIndexAtKey(key), newRow);
      }
    });

    if (rejectedCount > 0) {
      return {
        errorMessage: "stale update",
        type: "ERROR_RESULT",
      };
    }

    for (const sessionRow of [...sessionTable.rows]) {
      const key = sessionRow[sessionTable.indexOfKeyField] as string;
      const action = sessionTable.getAction(sessionRow);
      if (action === "addRow") {
        const sourceRow = sourceTable.schema.columns.map(
          ({ name }) => sessionRow[sessionTable.columnMap[name]],
        );
        sourceTable.insert(sourceRow);
      } else if (action === "deleteRow") {
        if (sourceTable.getRowAtKey(key, false)) {
          sourceTable.delete(key);
        }
      }
    }

    sessionTable.getSessionUpdates().forEach(({ cellUpdates }, key) => {
      const sessionRow = sessionTable.getRowAtKey(key, false);
      if (!sessionRow || sessionTable.getAction(sessionRow) === "deleteRow") {
        return;
      }
      const currentRow = sourceTable.getRowAtKey(key, false);
      if (!currentRow) {
        return;
      }
      const newRow = currentRow.slice();
      for (const [column, value] of Object.entries(cellUpdates)) {
        newRow[columnMap[column]] = value;
      }
      newRow[columnMap.vuuUpdatedTimestamp] = Date.now();
      sourceTable.update(sourceTable.rowIndexAtKey(key), newRow);
    });

    this.tableContainer.removeSessionTable(sessionTable.name);
    return { type: "SUCCESS_RESULT", data: undefined };
  };

  constructor(tableContainer: TableContainer) {
    super(tableContainer);
    this.registerRpc(RpcNames.EndEditSessionRpc, this.endEditSession);
  }
}
