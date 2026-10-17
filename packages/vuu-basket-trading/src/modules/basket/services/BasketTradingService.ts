import {
  type DataTable,
  type CellEdit,
  EditTableRpcHandler,
  type RpcParams,
  type TableContainer,
  type Viewport,
} from "@heswell/vuu-server";
import type { RpcResult } from "@vuu-ui/vuu-protocol-types";

type BasketInstanceParams = {
  basketInstanceId?: string;
};

export class BasketTradingService extends EditTableRpcHandler {
  private readonly constituents: DataTable;
  constructor(
    private readonly table: DataTable,
    tableContainer: TableContainer,
  ) {
    super(tableContainer);
    this.constituents = tableContainer.getTable<DataTable>("basketTradingConstituent");
    this.registerRpc("sendToMarket", (params) =>
      this.updateStatus(params, "ON_MARKET"),
    );
    this.registerRpc("takeOffMarket", (params) =>
      this.updateStatus(params, "OFF-MARKET"),
    );
  }

  protected canEditSource(viewport: Viewport): boolean {
    return viewport.dataTable === this.table;
  }

  protected validateCellEdit({ column, value, newRow }: CellEdit) {
    if (column === "side" && value !== "BUY" && value !== "SELL") {
      return "Basket side must be BUY or SELL";
    }
    if (column === "basketId") {
      const basketId = newRow[this.table.columnMap.basketId];
      if (this.constituents.rows.some((row) =>
        row[this.constituents.columnMap.instanceId] === newRow[this.table.columnMap.instanceId] &&
        row[this.constituents.columnMap.basketId] !== basketId
      )) {
        return "Cannot change the source basket of existing constituents";
      }
    }
  }

  protected applyCellEdit(edit: CellEdit): void {
    const { column, row, newRow, key, table } = edit;
    if (table !== this.table) {
      throw new Error("Basket edits must target the trading table directly");
    }
    const index = this.table.columnMap[column];
    if (row[index] === newRow[index]) return;
    const constituents = this.constituents;
    const changes = column === "side" || column === "units"
      ? constituents.rows
        .filter((row) => row[constituents.columnMap.instanceId] === key)
        .map((row) => {
          const updated = row.slice();
          if (column === "side") {
            updated[constituents.columnMap.side] =
              row[constituents.columnMap.side] === "BUY" ? "SELL" : "BUY";
          } else {
            updated[constituents.columnMap.quantity] = Math.trunc(
              Number(row[constituents.columnMap.weighting]) * Number(edit.value),
            );
          }
          return updated;
        })
      : [];
    super.applyCellEdit(edit);
    for (const updated of changes) {
      const key = String(updated[constituents.indexOfKeyField]);
      constituents.update(constituents.rowIndexAtKey(key), updated);
    }
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
    const constituents = this.constituents;
    for (const row of constituents.rows) {
      if (row[constituents.columnMap.instanceId] !== basketInstanceId) continue;
      const updated = row.slice();
      updated[constituents.columnMap.status] = status;
      updated[constituents.columnMap.orderStatus] =
        status === "ON_MARKET" ? "ACKED" : "CANCELLED";
      constituents.update(
        constituents.rowIndexAtKey(String(row[constituents.indexOfKeyField])),
        updated,
      );
    }
    return { type: "SUCCESS_RESULT", data: undefined };
  }
}
