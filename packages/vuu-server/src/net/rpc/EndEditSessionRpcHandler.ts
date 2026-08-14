import { RpcResult } from "@vuu-ui/vuu-protocol-types";
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

    const sourceTable = this.tableContainer.getTable<DataTable>(
      sessionTable.tableDef.name,
    );
    const { columnMap } = sourceTable;
    const preparedChanges: Array<
      SessionRowChange & { sourceRow?: VuuDataRow }
    > = [];
    let hasDuplicateKey = false;
    let hasStaleUpdate = false;

    for (const change of sessionTable.getSessionChanges()) {
      const {
        action,
        cellUpdates,
        isInserted,
        key,
        lastUpdateTimestamp,
        row,
      } = change;
      const sourceRow = sourceTable.getRowAtKey(key, false);

      if (isInserted) {
        if (action === "addRow" && sourceRow) {
          this.setSessionRowMessage(
            sessionTable,
            row,
            `addRow:${key}:key already exists`,
          );
          hasDuplicateKey = true;
        }
        preparedChanges.push(change);
        continue;
      }

      if (!sourceRow) {
        this.setSessionRowMessage(
          sessionTable,
          row,
          `${action || "editRow"}:${key}:source row missing`,
        );
        hasStaleUpdate = true;
        continue;
      }

      if (
        lastUpdateTimestamp !== sourceRow[columnMap.vuuUpdatedTimestamp] &&
        !force
      ) {
        const updateTimestamp = sourceRow[columnMap.vuuUpdatedTimestamp];
        const messages = Object.entries(cellUpdates).map(
          ([column, value]) =>
            `${column}:${value}:${sourceRow[columnMap[column]]}:${updateTimestamp}`,
        );
        if (action === "deleteRow") {
          messages.push(`deleteRow:${key}:${updateTimestamp}`);
        }
        this.setSessionRowMessage(sessionTable, row, messages.join(","));
        hasStaleUpdate = true;
        continue;
      }

      preparedChanges.push({ ...change, sourceRow });
    }

    if (hasDuplicateKey) {
      return {
        errorMessage: "duplicate key",
        type: "ERROR_RESULT",
      };
    }
    if (hasStaleUpdate) {
      return {
        errorMessage: "stale update",
        type: "ERROR_RESULT",
      };
    }

    for (const {
      action,
      isInserted,
      key,
      row,
      cellUpdates,
      sourceRow,
    } of preparedChanges) {
      if (action === "addRow") {
        const newSourceRow = sourceTable.schema.columns.map(
          ({ name }) => row[sessionTable.columnMap[name]],
        );
        sourceTable.insert(newSourceRow);
      } else if (action === "deleteRow") {
        if (!isInserted) {
          sourceTable.delete(key);
        }
      } else if (sourceRow) {
        const updatedRow = sourceRow.slice();
        for (const [column, value] of Object.entries(cellUpdates)) {
          updatedRow[columnMap[column]] = value;
        }
        updatedRow[columnMap.vuuUpdatedTimestamp] = Date.now();
        sourceTable.update(sourceTable.rowIndexAtKey(key), updatedRow);
      }
    }

    this.tableContainer.removeSessionTable(sessionTable.name);
    return { type: "SUCCESS_RESULT", data: undefined };
  };

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
