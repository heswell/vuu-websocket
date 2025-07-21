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
import { DataResponse } from "./IRowSet";

const NULL_SORTSET: SortSet = [[-1, -1, -1]];

export abstract class BaseRowSet {
  protected _table: Table;
  protected filterKeyMap: Map<string, number> = new Map();
  protected meta: ColumnMetaData;
  /** key values of selected rows   */
  protected selected: string[] = [];
  protected sortCols: VuuSortCol[] | undefined;
  protected sortedIndex = new Map<string, number>();

  public columns: string[];
  public currentFilter: Filter | undefined;
  /** filterSet is an array of index positions into the sortSet */
  public filterSet: number[] | undefined;
  public range: VuuRange = NULL_RANGE;
  public sortSet: SortSet = NULL_SORTSET;
  public viewportId: string;

  project: MultiRowProjectorFactory = () => () => {
    throw Error("project method must be implemented");
  };

  constructor(viewportId: string, table: Table, columns: string[]) {
    this.viewportId = viewportId;
    this._table = table;
    this.columns = columns;
    this.meta = metaData(columns);
  }

  get table() {
    return this._table;
  }

  protected get keyMap() {
    return this.filterSet ? this.filterKeyMap : this.sortedIndex;
  }

  get totalRowCount() {
    return this.table.rows.length;
  }

  get selectedRowCount() {
    return this.selected.length;
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

  clear() {
    console.log("clear rowset");
  }

  protected get indexOfKeyField() {
    return this.table.columnMap[this.table.schema.key];
  }
}
