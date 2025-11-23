import { NULL_RANGE } from "@vuu-ui/vuu-utils";
import { SortSet } from "../sortUtils";
import { Table } from "../table";
import { VuuRange, VuuSortCol } from "@vuu-ui/vuu-protocol-types";
import { Filter } from "@vuu-ui/vuu-filter-types";
import {
  ColumnMetaData,
  metaData,
  MultiRowProjectorFactory,
} from "../columnUtils";
import { DataResponse, DataResponseSelectedRows } from "./IRowSet";
import { SortedIndex } from "../SortedIndex";

export abstract class BaseRowSet {
  protected _table: Table;
  protected meta: ColumnMetaData;
  /** key values of selected rows   */
  protected selected = new Set<string>();
  protected sortCols: VuuSortCol[] | undefined;

  public columns: string[];
  public currentFilter: Filter | undefined;
  /** filterSet is an array of index positions into the sortSet */
  public range: VuuRange = NULL_RANGE;
  public viewportId: string;

  protected sortedIndex: SortedIndex;

  project: MultiRowProjectorFactory = () => () => {
    throw Error("project method must be implemented");
  };

  constructor(viewportId: string, table: Table, columns: string[]) {
    this.viewportId = viewportId;
    this._table = table;
    this.columns = columns;
    this.meta = metaData(columns);
    this.sortedIndex = new SortedIndex(table);
  }

  get table() {
    return this._table;
  }

  get keys() {
    return this.sortedIndex.keys;
  }

  protected get keyMap() {
    return this.sortedIndex.keyMap;
  }

  get totalRowCount() {
    return this.table.rows.length;
  }

  get selectedRowCount() {
    return this.selected.size;
  }

  get selectedKeys() {
    return this.selected;
  }

  get size(): number {
    throw Error("not implemented");
  }

  abstract setRange(range?: VuuRange, useDelta?: boolean): DataResponse;

  abstract filter(filter: Filter): void;

  abstract sort(sortDefs: VuuSortCol[]): void;

  selectRow(
    rowKey: string,
    preserveExistingSelection: boolean
  ): DataResponseSelectedRows {
    throw Error("not implemented");
  }

  deselectRow(
    rowKey: string,
    preserveExistingSelection: boolean
  ): DataResponseSelectedRows {
    throw Error("not implemented");
  }

  selectRowRange(
    fromRowKey: string,
    toRowKey: string,
    preserveExistingSelection: boolean
  ): DataResponseSelectedRows {
    throw Error("not implemented");
  }

  clear() {
    console.log("clear rowset");
  }

  protected get indexOfKeyField() {
    return this.table.columnMap[this.table.schema.key];
  }
}
