import {
  DataTable,
  DefaultRpcHandler,
  RpcParams,
  RpcSuccessResult,
  TableContainer,
} from "@heswell/vuu-server";

export class DismissNotificationRpcHandler extends DefaultRpcHandler {
  constructor(
    private table: DataTable,
    tableContainer: TableContainer,
  ) {
    super(tableContainer);
    this.registerRpc("dismissNotification", this.dismissNotification);
  }

  private dismissNotification = (params: RpcParams) => {
    const username = params.ctx.user.name;
    const selection = params.viewport.selectedKeys;
    const { columnMap } = this.table;

    for (const rowKey of selection) {
      const row = this.table.getRowAtKey(rowKey, false);
      if (row) {
        const updatedRow = row.slice();
        updatedRow[columnMap.status] = "dismissed";
        updatedRow[columnMap.dismissedBy] = username;
        if (columnMap.vuuUpdatedTimestamp !== undefined) {
          updatedRow[columnMap.vuuUpdatedTimestamp] = Date.now();
        }
        this.table.upsert(updatedRow);
      }
    }

    return RpcSuccessResult({
      success: true,
      dismissedCount: selection.size,
    });
  };
}
