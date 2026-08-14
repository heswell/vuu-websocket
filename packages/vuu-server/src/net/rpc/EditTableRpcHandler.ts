import { RpcResult, VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import { TableContainer } from "../../core/table/TableContainer";
import { DefaultRpcHandler } from "./DefaultRpcHandler";
import { RpcParams } from "./Rpc";
import { DataTable } from "../../core/table/InMemDataTable";
import { InMemSessionDataTable } from "../../core/table/InMemSessionDataTable";
import { RpcNames } from "../../util/RpcNames";

export class EditTableRpcHandler extends DefaultRpcHandler {
  editCell = ({ namedParams, viewport }: RpcParams): RpcResult => {
    console.log(`editCell ${viewport.id} ${JSON.stringify(namedParams)}`);

    const { column, data, key } = namedParams as {
      column: string;
      data: VuuRowDataItemType;
      key: string;
    };

    if (column === "vuu_action") {
      return {
        type: "ERROR_RESULT",
        errorMessage: "editCell: vuu_action is server controlled",
      };
    }

    if (column === "lotSize" && typeof data === "number" && data > 1000) {
      return {
        type: "ERROR_RESULT",
        errorMessage: "max valid value for lotSize is 1,000",
      };
    }

    const targetTable = viewport.dataTable;
    if (targetTable) {
      try {
        // assertUpdateIsValid(targetTable.schema, column as string, data);
        const currentRow = targetTable.getRowAtKey(key);
        if (currentRow) {
          const rowIdx = targetTable.rowIndexAtKey(key);
          const newRow = currentRow.slice();
          newRow[targetTable.columnMap[column]] = data;
          targetTable.update(rowIdx, newRow, column);
        } else {
          // TODO
        }
        return {
          type: "SUCCESS_RESULT",
          data: undefined,
        };
      } catch (e) {
        const { message } = e as Error;
        return {
          type: "ERROR_RESULT",
          errorMessage: message,
        };
      }
    } else {
      throw Error("[VuuModule] editCell unable to find table for dataSource");
    }
  };

  addRow = ({ namedParams, viewport }: RpcParams): RpcResult => {
    const { data, key } = namedParams as {
      data: Record<string, VuuRowDataItemType>;
      key?: string;
    };

    try {
      const sessionTable = this.requireSessionTable(
        viewport.dataTable,
        "addRow",
      );
      const rowKey = key ?? crypto.randomUUID();
      const sourceTable = this.tableContainer.getTable<DataTable>(
        sessionTable.tableDef.name,
      );
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

  deleteRow = ({ namedParams, viewport }: RpcParams): RpcResult => {
    const { key } = namedParams as { key: string };

    try {
      const sessionTable = this.requireSessionTable(
        viewport.dataTable,
        "deleteRow",
      );
      sessionTable.markRowDeleted(key);
      return { type: "SUCCESS_RESULT", data: undefined };
    } catch (error) {
      return this.errorResult(error);
    }
  };

  deleteSelectedRows = ({ viewport }: RpcParams): RpcResult => {
    const deletedKeys: string[] = [];

    try {
      const sessionTable = this.requireSessionTable(
        viewport.dataTable,
        "deleteSelectedRows",
      );
      for (const key of viewport.selectedKeys) {
        if (!sessionTable.getRowAtKey(key, false)) {
          throw Error(`deleteSelectedRows: row ${key} not found`);
        }
      }
      for (const key of viewport.selectedKeys) {
        sessionTable.markRowDeleted(key);
        deletedKeys.push(key);
      }
      return { type: "SUCCESS_RESULT", data: { deletedKeys } };
    } catch (error) {
      return this.errorResult(error);
    }
  };

  undoRowChange = ({ namedParams, viewport }: RpcParams): RpcResult => {
    const { key } = namedParams as { key: string };

    try {
      const sessionTable = this.requireSessionTable(
        viewport.dataTable,
        "undoRowChange",
      );
      const sourceTable = this.tableContainer.getTable<DataTable>(
        sessionTable.tableDef.name,
      );
      sessionTable.undoRowChange(key, sourceTable);
      return { type: "SUCCESS_RESULT", data: undefined };
    } catch (error) {
      return this.errorResult(error);
    }
  };

  private requireSessionTable(
    table: object,
    rpcName: string,
  ): InMemSessionDataTable {
    if (table instanceof InMemSessionDataTable) {
      return table;
    }
    throw Error(`${rpcName}: viewport is not using a session table`);
  }

  private errorResult(error: unknown): RpcResult {
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
