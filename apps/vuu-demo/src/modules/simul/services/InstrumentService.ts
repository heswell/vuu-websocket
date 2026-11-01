import {
  getLogger,
  CellViewPortMenuItem,
  type CellEdit,
  type RequestContext,
  type Viewport,
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

const log = getLogger("demo.simul");

export const MAX_LOT_SIZE = 1000;

export class InstrumentService extends EditSessionRpcHandler {
  constructor(
    table: DataTable,
    providerContainer: ProviderContainer,
    tableContainer: TableContainer,
  ) {
    super(tableContainer);
  }

  /**
   * The demo instruments grid edits cells directly, without first opening an
   * edit session.
   */
  protected canEditSource(
    viewport: Viewport,
    _column: string,
    _ctx: RequestContext,
  ) {
    return viewport.dataTable.name === "instruments";
  }

  protected validateCellEdit({ column, value }: CellEdit) {
    if (
      column === "lotSize" &&
      typeof value === "number" &&
      value > MAX_LOT_SIZE
    ) {
      return "max valid value for lotSize is 1,000";
    }
  }

  private editRows = () => {
    log.debug("edit rows");
    return NoAction();
  };

  private addRowsToOrders = () => {
    log.debug("addRowsToOrders");
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
