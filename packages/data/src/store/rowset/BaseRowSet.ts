import { NULL_RANGE } from "@vuu-ui/vuu-utils";
import { SortSet } from "../sortUtils";
import { Table, TableIndex } from "../table";
import { VuuRange, VuuRow, VuuSortCol } from "@vuu-ui/vuu-protocol-types";
import { Filter } from "@vuu-ui/vuu-filter-types";
import {
  ColumnMetaData,
  metaData,
  MultiRowProjectorFactory,
  projectColumn,
} from "../columnUtils";
import { TableColumn } from "@heswell/server-types";
import { DataResponse } from "./IRowSet";
import { identifySelectionChanges } from "../selectionUtils";

const NULL_SORTSET: SortSet = [[-1, -1, -1]];

export abstract class BaseRowSet {
  protected _table: Table;
  protected filterKeyMap: Map<string, number> = new Map();
  protected meta: ColumnMetaData;
  /** key values of selected rows   */
  protected selected: string[] = [];
  protected sortCols: VuuSortCol[] | undefined;
  protected sortedIndex = new Map<string, number>();

  public columns: TableColumn[];
  public currentFilter: Filter | undefined;
  /** filterSet is an array of index positions into the sortSet */
  public filterSet: number[] | undefined;
  public range: VuuRange = NULL_RANGE;
  public sortSet: SortSet = NULL_SORTSET;
  public viewportId: string;

  project: MultiRowProjectorFactory = () => () => {
    throw Error("project method must be implemented");
  };

  constructor(viewportId: string, table: Table, columns: TableColumn[]) {
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

  // selected are the index positions of rows as presented to the user. That
  // means they refer to positions within the current indexSet. We will store
  // them as positions within the underlying table, which never change.
  // Note: deletions from the underlying table will have to be dealt with.

  private selectedIndicesToKeyValues = (selectedIndices: number[]) => {
    const {
      filterSet,
      sortSet,
      table: { columnMap, rows, schema },
    } = this;
    const indexOfKeyField = columnMap[schema.key];
    if (filterSet) {
      return selectedIndices.map((idx) => {
        const sortSetIndex = filterSet[idx];
        const [rowIndex] = sortSet[sortSetIndex];
        return rows[rowIndex][indexOfKeyField] as string;
      });
    } else {
      return selectedIndices.map(
        (idx) => rows[sortSet[idx][0]][indexOfKeyField] as string
      );
    }
  };

  select(selected: number[]): DataResponse {
    const {
      filterKeyMap,
      filterSet,
      range,
      size,
      sortedIndex: sortKeyMap,
      sortSet,
    } = this;
    const { columnMap, rows } = this._table;

    const selectedKeyValues = this.selectedIndicesToKeyValues(selected);

    const { from, to } = range;
    const [newSelected, deselected] = identifySelectionChanges(
      this.selected,
      selectedKeyValues
    );
    this.selected = selectedKeyValues;
    const keyMap = filterSet ? filterKeyMap : sortKeyMap;
    const getRowIndex = filterSet
      ? (idx: number) => sortSet[filterSet[idx]][0]
      : (idx: number) => sortSet[idx][0];

    const keyFieldIndex = columnMap[this.table.schema.key];

    const updatedRows: VuuRow[] = [];
    const projectRow = projectColumn(
      keyFieldIndex,
      this.viewportId,
      selectedKeyValues,
      this.size
    );

    for (const key of newSelected) {
      const idx = keyMap.get(key) as number;
      const rowIndex = getRowIndex(idx);
      if (idx >= from && idx < to) {
        updatedRows.push(projectRow(rows[rowIndex], idx));
      }
    }

    for (const key of deselected) {
      const idx = keyMap.get(key) as number;
      const rowIndex = getRowIndex(idx);
      if (idx >= from && idx < to) {
        updatedRows.push(projectRow(rows[rowIndex], idx));
      }
    }

    return {
      rows: updatedRows,
      size,
    };
  }
}
