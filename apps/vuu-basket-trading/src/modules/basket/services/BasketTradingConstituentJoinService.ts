import {
  type CellEdit,
  type DataTable,
  EditTableRpcHandler,
  type MenuRpcSession,
  NoAction,
  OutboundRowPublishQueue,
  RequestContext,
  RpcParams,
  SelectionViewPortMenuItem,
  ShowNotification,
  type TableContainer,
  ViewPortMenu,
  type ViewPortSelection,
  type Viewport,
} from "@heswell/vuu-server";
import type { RpcResult, VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import { createTradingConstituent } from "./trading-rows";

export class BasketTradingConstituentJoinService extends EditTableRpcHandler {
  private readonly constituentTable: DataTable;

  constructor(tableContainer: TableContainer) {
    super(tableContainer);
    this.constituentTable =
      tableContainer.getTable<DataTable>("basketTradingConstituent");
    this.registerRpc("editRow", this.editRow);
    this.registerRpc("setSell", (params) => this.setSide(params, "SELL"));
    this.registerRpc("setBuy", (params) => this.setSide(params, "BUY"));
    this.registerRpc("addConstituent", this.addConstituent);
  }

  get menuItems() {
    return ViewPortMenu(
      "Direction",
      new SelectionViewPortMenuItem(
        "Set Sell",
        "",
        (selection, _sessionId, session) =>
          this.setSideFromMenu(selection, session, "SELL"),
        "SET_SELECTION_SELL",
      ),
      new SelectionViewPortMenuItem(
        "Set Buy",
        "",
        (selection, _sessionId, session) =>
          this.setSideFromMenu(selection, session, "BUY"),
        "SET_SELECTION_Buy",
      ),
    );
  }

  protected canEditSource(viewport: Viewport): boolean {
    return viewport.dataTable.name === "basketTradingConstituentJoin";
  }

  protected isEditableColumn(
    table: DataTable,
    column: string,
    viewport: Viewport,
    ctx: RequestContext,
  ): boolean {
    return (
      table.name === "basketTradingConstituentJoin" &&
      this.constituentTable.columnMap[column] !== undefined &&
      super.isEditableColumn(table, column, viewport, ctx)
    );
  }

  protected applyCellEdit({ key, column, value }: CellEdit): void {
    const table = this.constituentTable;
    const row = table.getRowAtKey(key).slice();
    row[table.columnMap[column]] = value;
    table.update(table.rowIndexAtKey(key), row, column);
  }

  protected validateCellEdit({ table, column, value, newRow, viewport, key }: CellEdit) {
    if (column === "side" && value !== "BUY" && value !== "SELL") {
      return "Constituent side must be BUY or SELL";
    }
    const trading = this.tableContainer.getTable<DataTable>("basketTrading");
    const instanceId = String(newRow[table.columnMap.instanceId]);
    const basket = trading.getRowAtKey(instanceId, false);
    if (
      !basket ||
      basket[trading.columnMap.basketId] !== newRow[table.columnMap.basketId]
    ) {
      return "A constituent must reference an existing trading basket and its basketId";
    }
    const permitted = viewport.permissionFilter?.createPredicate(table.columnMap);
    if (permitted && !permitted(this.joinedRow(viewport, table, newRow))) {
      return `editCell: edit would make row ${key} inaccessible to the user`;
    }
  }

  private editRow = (params: RpcParams): RpcResult => {
    try {
      const { key, data } = params.namedParams;
      if (
        typeof data !== "object" ||
        data === null ||
        Array.isArray(data) ||
        Object.keys(data).length === 0
      ) {
        throw new Error('Invalid RPC param "data"');
      }
      let pendingRow: VuuDataRow | undefined;
      const fields = Object.entries(data).filter(
        ([column, value]) =>
          column !== this.constituentTable.schema.key || value !== key,
      );
      const edits = fields.map(([column, value]) => {
        const edit = this.prepareCellEdit(
          RpcParams({ key, column, data: value }, params.viewport, params.ctx),
          pendingRow,
        );
        pendingRow = edit.newRow;
        return edit;
      });
      if (edits.length === 0) {
        if (typeof key !== "string" || !this.isRowAccessible(params.viewport, key)) {
          throw new Error(`editRow: row ${key} not found`);
        }
        return { type: "SUCCESS_RESULT", data: undefined };
      }
      const table = this.constituentTable;
      const row = table.getRowAtKey(edits[0].key).slice();
      for (const { column, value } of edits) {
        row[table.columnMap[column]] = value;
      }
      table.update(table.rowIndexAtKey(edits[0].key), row);
      return { type: "SUCCESS_RESULT", data: undefined };
    } catch (error) {
      return this.errorResult(error);
    }
  };

  private setSide(params: RpcParams, side: string): RpcResult {
    try {
      const selection = params.namedParams.selection;
      let keys = params.viewport.selectedKeys;
      if (selection !== undefined) {
        if (
          typeof selection !== "object" ||
          selection === null ||
          !("rowKeys" in selection) ||
          !(selection.rowKeys instanceof Set) ||
          ![...selection.rowKeys].every((key) => typeof key === "string")
        ) {
          throw new Error('Invalid RPC param "selection"');
        }
        keys = selection.rowKeys;
      }
      const edits = [...keys].map((key) =>
        this.prepareCellEdit(
          RpcParams(
            { key, column: "side", data: side },
            params.viewport,
            params.ctx,
          ),
        ),
      );
      for (const edit of edits) this.applyCellEdit(edit);
      return { type: "SUCCESS_RESULT", data: undefined };
    } catch (error) {
      return this.errorResult(error);
    }
  }

  private setSideFromMenu(
    selection: ViewPortSelection,
    session: MenuRpcSession,
    side: string,
  ) {
    const ctx = RequestContext(
      session.requestId,
      session.user,
      session,
      new OutboundRowPublishQueue(),
    );
    const result = this.setSide(
      RpcParams({ selection }, session.viewport, ctx),
      side,
    );
    return result.type === "ERROR_RESULT"
      ? ShowNotification(result.errorMessage, "Could not update constituents")
      : NoAction();
  }

  private addConstituent = ({ namedParams, viewport }: RpcParams): RpcResult => {
    try {
      const { ric, basketInstanceId } = namedParams;
      if (
        typeof ric !== "string" || ric.trim() === "" ||
        typeof basketInstanceId !== "string" || basketInstanceId.trim() === ""
      ) {
        throw new Error("Invalid add constituent request");
      }
      const joined = viewport.dataTable;
      if (joined.name !== "basketTradingConstituentJoin") {
        throw new Error("addConstituent requires the constituent join table");
      }
      const trading = this.tableContainer.getTable<DataTable>("basketTrading");
      const trade = trading.getRowAtKey(basketInstanceId, false);
      if (!trade) throw new Error("Basket not found");
      const parentPermission = trading.tableDef.permissionFunction?.(viewport, this.tableContainer)
        .createPredicate(trading.columnMap);
      if (parentPermission && !parentPermission(trade)) {
        throw new Error("Basket not found");
      }
      if (trade[trading.columnMap.status] === "ON_MARKET") {
        throw new Error("Take the basket off market before adding constituents");
      }
      const table = this.constituentTable;
      const source = this.tableContainer.getTable<DataTable>("basketConstituent");
      const reference = source.rows.find(
        (row) => row[source.columnMap.ric] === ric,
      );
      if (!reference) throw new Error(`Unknown constituent ${ric}`);
      if (
        table.rows.some(
          (row) =>
            row[table.columnMap.instanceId] === basketInstanceId &&
            row[table.columnMap.ric] === ric,
        )
      ) {
        throw new Error(
          `${ric} is already in this basket`,
        );
      }
      const row = createTradingConstituent(
        trading, trade, ric, String(reference[source.columnMap.description]), 0.1,
      );
      const key = String(row[table.indexOfKeyField]);
      if (table.getRowAtKey(key, false)) {
        throw new Error(`${ric} is already in this basket`);
      }
      const permitted = viewport.permissionFilter?.createPredicate(
        joined.columnMap,
      );
      if (permitted && !permitted(this.joinedRow(viewport, table, row))) {
        throw new Error(
          "addConstituent: new row would be inaccessible to the user",
        );
      }
      table.insert(row);
      return { type: "SUCCESS_RESULT", data: key };
    } catch (error) {
      return this.errorResult(error);
    }
  };

  private joinedRow(viewport: Viewport, source: DataTable, row: VuuDataRow) {
    const prices = this.tableContainer.getTable<DataTable>("prices");
    const price = prices.getRowAtKey(String(row[source.columnMap.ric]), false);
    // Match JoinTable's null representation for unmatched right-side fields.
    return viewport.dataTable.schema.columns.map(({ name }) =>
      this.constituentTable.columnMap[name] !== undefined
        ? row[source.columnMap[name]]
        : price?.[prices.columnMap[name]] ?? null,
    ) as VuuDataRow;
  }
}
