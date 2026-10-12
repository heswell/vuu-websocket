import {
  CellViewPortMenuItem,
  type DataTable,
  EditSessionRpcHandler,
  type MenuRpcSession,
  NoAction,
  ProviderContainer,
  RowViewPortMenuItem,
  SelectionViewPortMenuItem,
  ShowNotification,
  TableContainer,
  TableViewPortMenuItem,
  ViewPortMenu,
  type ViewPortSelection,
} from "@heswell/vuu-server";
import type {
  VuuDataRowDto,
  VuuRowDataItemType,
} from "@vuu-ui/vuu-protocol-types";

export class InstrumentService extends EditSessionRpcHandler {
  constructor(
    table: DataTable,
    providerContainer: ProviderContainer,
    tableContainer: TableContainer,
  ) {
    super(tableContainer);
  }

  private editRows = () => {
    console.log("edit rows");
    return NoAction();
  };

  private addRowsToOrders = () => {
    console.log("addRowsToOrders");
    return NoAction();
  };

  private testSelect = (selection: ViewPortSelection) =>
    ShowNotification(
      `${selection.rowKeys.size} instrument(s) selected`,
      "Test Selection",
    );

  private testTable = ({ user, viewport }: MenuRpcSession) =>
    ShowNotification(
      `${viewport.size} instruments, invoked by ${user.name}`,
      "Test Table",
    );

  private testRow = (rowKey: string, row: VuuDataRowDto) =>
    ShowNotification(`${rowKey}: ${row.description ?? ""}`, "Test Row");

  private testCell = (
    rowKey: string,
    field: string,
    value: VuuRowDataItemType,
  ) => ShowNotification(`${rowKey}.${field} = ${value}`, "Test Cell");

  get menuItems() {
    // prettier-ignore
    return ViewPortMenu(
      new SelectionViewPortMenuItem( "Edit rows", "", this.editRows, "VP_BULK_EDIT_BEGIN_RPC" ),
      new SelectionViewPortMenuItem( "Add rows to orders", "", this.addRowsToOrders, "ADD_ROWS_TO_ORDERS" ),
      ViewPortMenu("Test",
        new SelectionViewPortMenuItem( "Test Selection", "", this.testSelect, "TEST_SELECT" ),
        new TableViewPortMenuItem( "Test Table", "", this.testTable, "TEST_TABLE" ),
        new RowViewPortMenuItem( "Test Row", "", this.testRow, "TEST_ROW" ),
        new RowViewPortMenuItem( "Test Row EUR", 'currency = "EUR"', this.testRow, "TEST_ROW_EUR" ),
        new CellViewPortMenuItem( "Test Cell", "", this.testCell, "TEST_CELL" ),
        new CellViewPortMenuItem( "Test CCY Cell", "", this.testCell, "TEST_CURRENCY_CELL", "currency" ),
      ),
    );
  }
}
