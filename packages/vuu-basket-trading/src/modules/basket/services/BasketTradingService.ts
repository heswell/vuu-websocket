import { DefaultRpcHandler } from "@heswell/vuu-server";
import type { DataTable, TableContainer } from "@heswell/vuu-server";
import type { RpcResult } from "@vuu-ui/vuu-protocol-types";
import type { RpcParams } from "@heswell/vuu-server/src/net/rpc/Rpc";

type BasketInstanceParams = {
  basketInstanceId?: string;
};

export class BasketTradingService extends DefaultRpcHandler {
  constructor(
    private readonly table: DataTable,
    tableContainer: TableContainer,
  ) {
    super(tableContainer);
    this.registerRpc("sendToMarket", (params) =>
      this.updateStatus(params, "ON_MARKET"),
    );
    this.registerRpc("takeOffMarket", (params) =>
      this.updateStatus(params, "OFF-MARKET"),
    );
  }

  private updateStatus(
    { namedParams }: RpcParams<BasketInstanceParams>,
    status: string,
  ): RpcResult {
    const { basketInstanceId } = namedParams;
    if (typeof basketInstanceId !== "string" || basketInstanceId.trim() === "") {
      return {
        type: "ERROR_RESULT",
        errorMessage: 'Invalid RPC param "basketInstanceId"',
      };
    }

    const row = this.table.getRowAtKey(basketInstanceId, false);
    if (!row) {
      return {
        type: "ERROR_RESULT",
        errorMessage: `Unknown basket instance "${basketInstanceId}"`,
      };
    }

    const updatedRow = row.slice();
    updatedRow[this.table.columnMap.status] = status;
    this.table.upsert(updatedRow);
    return { type: "SUCCESS_RESULT", data: undefined };
  }
}
