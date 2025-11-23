import { filterPredicate } from "@vuu-ui/vuu-filter-parser";
import { Filter } from "@vuu-ui/vuu-filter-types";
import type {
  VuuDataRow,
  VuuRange,
  VuuRow,
  VuuSortCol,
} from "@vuu-ui/vuu-protocol-types";
import { projectColumn, projectColumns } from "../columnUtils.ts";
import { extendsExistingFilter } from "../filter.ts";
import { getDeltaRange, getFullRange } from "../rangeUtils.ts";
import {
  getSortSetInsertionPosition,
  sortExtendsExistingSort,
  sortRemoved,
  sortReversed,
  SortSet,
} from "../sortUtils.ts";
import { Table } from "../table.ts";
import { BaseRowSet } from "./BaseRowSet.ts";
import { DataResponse } from "./IRowSet.ts";
import logger from "../../logger.ts";

const SINGLE_COLUMN = 1;

const NO_OPTIONS: RowSetConstructorOptions = {};

export type RowSetConstructorOptions = {
  filter?: Filter;
  range?: VuuRange;
  sortSet?: SortSet;
};

export class RowSet extends BaseRowSet {
  constructor(
    viewportId: string,
    table: Table,
    columns: string[],
    { filter, range, sortSet }: RowSetConstructorOptions = NO_OPTIONS
  ) {
    super(viewportId, table, columns);
    const { columnMap } = table;
    const keyFieldIndex = columnMap[table.schema.key];
    this.project = projectColumns(
      keyFieldIndex,
      this.viewportId,
      columns,
      columnMap
    );

    if (range) {
      this.range = range;
    }

    if (filter) {
      this.currentFilter = filter;
      this.filter(filter);
    }
  }

  setRange(range = this.range, useDelta = true): DataResponse {
    const { from, to } = useDelta
      ? getDeltaRange(this.range, range)
      : getFullRange(range);
    const resultset = this.slice(from, to);
    logger.info(`[RowSet] setRange ${range.from}:${range.to}`);
    this.range = range;
    return {
      rows: resultset,
      size: this.size,
    };
  }

  currentRange(): DataResponse {
    const { from, to } = this.range;
    const resultset = this.slice(from, to);
    return {
      rows: resultset,
      size: this.size,
    };
  }

  slice(lo: number, hi: number) {
    const { table, selected } = this;
    const { keys: indexSet, filterSet, sortSet } = this.sortedIndex;

    const getRowIndex = filterSet
      ? (idx: number) => sortSet[filterSet[idx]][0]
      : (idx: number) => sortSet[idx][0];

    const results: VuuRow[] = [];
    const projectRow = this.project(selected, this.size);

    for (let i = lo, len = indexSet.length; i < len && i < hi; i++) {
      const rowIndex = getRowIndex(i);
      results.push(projectRow(table.rowAt(rowIndex), i));
    }

    return results;
  }

  get size() {
    return this.sortedIndex.length;
  }

  get first() {
    return this.table.rows[0];
  }
  get last() {
    return this.table.rows.at(-1);
  }

  selectRow(rowKey: string, preserveExistingSelection: boolean) {
    const deselectedRowKeys = preserveExistingSelection
      ? []
      : Array.from(this.selected);
    if (!preserveExistingSelection) {
      this.selected.clear();
    }
    this.selected.add(rowKey);

    const { range, size } = this;
    const { filterSet, keyMap, sortSet } = this.sortedIndex;
    const { columnMap, rows } = this._table;

    // walk the rows in client range and create update records for any where
    // key value is deselected or selected
    const { from, to } = range;
    const getRowIndex = filterSet
      ? (idx: number) => sortSet[filterSet[idx]][0]
      : (idx: number) => sortSet[idx][0];

    const keyFieldIndex = columnMap[this.table.schema.key];

    const updatedRows: VuuRow[] = [];
    const projectRow = projectColumn(
      keyFieldIndex,
      this.viewportId,
      this.selected,
      this.size
    );

    for (const key of this.selected) {
      const idx = keyMap.get(key) as number;
      const rowIndex = getRowIndex(idx);
      if (idx >= from && idx < to) {
        updatedRows.push(projectRow(rows[rowIndex], idx));
      }
    }

    for (const key of deselectedRowKeys) {
      const idx = keyMap.get(key) as number;
      const rowIndex = getRowIndex(idx);
      if (idx >= from && idx < to) {
        updatedRows.push(projectRow(rows[rowIndex], idx));
      }
    }

    return {
      rows: updatedRows,
      selectedRowCount: 0,
      size,
    };
  }

  deselectRow(rowKey: string, preserveExistingSelection: boolean) {
    const deselectedRowKeys = preserveExistingSelection
      ? [rowKey]
      : Array.from(this.selected);
    if (!preserveExistingSelection) {
      this.selected.clear();
    } else {
      this.selected.delete(rowKey);
    }

    const { range, size } = this;
    const { filterSet, keyMap, sortSet } = this.sortedIndex;
    const { columnMap, rows } = this._table;

    // walk the rows in client range and create update records for any where
    // key value is deselected or selected
    const { from, to } = range;
    const getRowIndex = filterSet
      ? (idx: number) => sortSet[filterSet[idx]][0]
      : (idx: number) => sortSet[idx][0];

    const keyFieldIndex = columnMap[this.table.schema.key];

    const updatedRows: VuuRow[] = [];
    const projectRow = projectColumn(
      keyFieldIndex,
      this.viewportId,
      this.selected,
      this.size
    );

    for (const key of deselectedRowKeys) {
      const idx = keyMap.get(key) as number;
      const rowIndex = getRowIndex(idx);
      if (idx >= from && idx < to) {
        updatedRows.push(projectRow(rows[rowIndex], idx));
      }
    }

    return {
      rows: updatedRows,
      selectedRowCount: 0,
      size,
    };
  }

  selectRowRange(
    fromRowKey: string,
    toRowKey: string,
    preserveExistingSelection: boolean
  ) {
    const { size } = this;
    const updatedRows: VuuRow[] = [];

    return {
      rows: updatedRows,
      selectedRowCount: 0,
      size,
    };
  }

  get selectedRows() {
    return this.selected.map((key) => {});
  }

  get selectedRowKeyIndex() {
    return this.selected.reduce<Map<string, number>>(
      (map, key) => (map.set(key, this.keyMap.get(key) as number), map),
      new Map()
    );
  }

  sort(sortCols: VuuSortCol[]) {
    const start = performance.now();
    const { table } = this;
    const { filterSet, sortSet } = this.sortedIndex;
    const { columnMap } = this._table;

    if (sortRemoved(this.sortCols, sortCols)) {
      this.sortedIndex.revertSort();
    } else if (sortReversed(this.sortCols, sortCols, SINGLE_COLUMN)) {
      this.sortedIndex.reverseSortSet();
    } else if (sortExtendsExistingSort(this.sortCols, sortCols)) {
      this.sortedIndex.extendSort(sortCols);
    } else {
      this.sortedIndex.sort(sortCols);
    }

    this.sortCols = sortCols.length > 0 ? sortCols : undefined;

    if (filterSet && this.currentFilter) {
      const fn = filterPredicate(columnMap, this.currentFilter);

      const getRowIndex = (idx: number) => sortSet[idx][0];
      const newFilterSet: number[] = [];

      for (let i = 0; i < sortSet.length; i++) {
        const rowIdx = getRowIndex(i);
        const row = table.rows[rowIdx];
        if (fn(row)) {
          newFilterSet.push(i);
        }
      }

      this.sortedIndex.filterSet = newFilterSet;
    }
    const end = performance.now();
    console.log(`sort took ${end - start} ms`);
  }

  clearFilter() {
    this.currentFilter = undefined;
    this.sortedIndex.filterSet = undefined;
  }

  filter(filter: Filter) {
    const { columnMap } = this._table;

    const start = performance.now();
    const extendsCurrentFilter = extendsExistingFilter(
      filter,
      this.currentFilter
    );

    const fn = filterPredicate(columnMap, filter);
    const { table } = this;
    const { filterSet, sortSet } = this.sortedIndex;

    // if we're extending the current filter, filterset cannot be undefined
    const indexSet = extendsCurrentFilter ? (filterSet as number[]) : sortSet;
    const getRowIndex =
      indexSet === filterSet
        ? (idx: number) => sortSet[filterSet[idx]][0]
        : (idx: number) => sortSet[idx][0];

    const newFilterSet: number[] = [];

    for (let i = 0; i < indexSet.length; i++) {
      const rowIdx = getRowIndex(i);
      const row = table.rows[rowIdx];
      if (fn(row)) {
        newFilterSet.push(i);
      }
    }

    this.sortedIndex.filterSet = newFilterSet;
    this.currentFilter = filter;

    const end = performance.now();
    console.log(`filter took ${end - start} ms`);
  }

  update(rowIdx: number, _: VuuDataRow): DataResponse | undefined {
    // console.log(`[RowSet] update [${rowIdx}]`, {
    //   sortCols: this.sortCols,
    //   filter: this.currentFilter,
    // });

    if (this.currentFilter === undefined && this.sortCols === undefined) {
      if (rowIdx >= this.range.from && rowIdx < this.range.to) {
        return { rows: this.slice(rowIdx, rowIdx + 1), size: this.size };
      }
    } else if (this.currentFilter === undefined) {
      // if we've sorted the data we're going to have to search for the rowIndex
      const sortedIdx = this.sortedIndex.sortSet.findIndex(
        ([idx]) => idx === rowIdx
      );
      if (sortedIdx >= this.range.from && sortedIdx < this.range.to) {
        return { rows: this.slice(sortedIdx, sortedIdx + 1), size: this.size };
      }
    } else if (this.sortedIndex.filterSet) {
      if (this.sortCols === undefined) {
        const filterIdx = this.sortedIndex.filterSet.findIndex(
          (i) => i === rowIdx
        );
        if (filterIdx !== -1) {
          if (filterIdx >= this.range.from && filterIdx < this.range.to) {
            return {
              rows: this.slice(filterIdx, filterIdx + 1),
              size: this.size,
            };
          }
        }
      } else {
        throw Error("whoah, filter AND sort");
      }
    }
  }

  delete(rowIndex: number, row: VuuDataRow): DataResponse {
    const { sortSet } = this.sortedIndex;
    if (this.sortCols === undefined) {
      // the sortSet is still in table order
      sortSet.length -= 1;

      if (rowIndex >= this.range.to) {
        // ... row is beyond viewport
        return {
          rows: [],
          size: this.size,
        };
      } else {
        // ... row is within viewport
        return {
          rows: this.slice(Math.max(rowIndex, this.range.from), this.range.to),
          size: this.size,
        };
      }
    }
    return {
      rows: [],
      size: this.size,
    };
  }
  insert(rowIndex: number, row: VuuDataRow): DataResponse {
    const { columnMap } = this._table;
    const { sortSet } = this.sortedIndex;

    // TODO multi colun sort sort DSC
    if (this.sortCols === undefined && this.currentFilter === undefined) {
      // simplest scenario, row will be at end of sortset ...
      sortSet.push([rowIndex, 0, 0]);
      if (rowIndex >= this.range.to) {
        // ... row is beyond viewport
        return {
          rows: [],
          size: this.size,
        };
      } else {
        // ... row is within viewport
        return {
          rows: this.slice(rowIndex, rowIndex + 1),
          size: this.size,
        };
      }
    } else if (
      this.sortCols !== undefined &&
      this.currentFilter === undefined
    ) {
      // data is sorted
      // 1) get the values from new row for the sorted columns

      const [sortCol] = this.sortCols;
      const sortColKey = columnMap[sortCol.column];
      const sortValue = row[sortColKey];

      const insertPosition = getSortSetInsertionPosition(
        sortSet,
        sortCol,
        sortValue
      );

      if (insertPosition === "start") {
        sortSet.unshift([rowIndex, sortValue, 0]);

        if (this.range.from === 0) {
          return this.currentRange();
        } else {
          return {
            rows: [],
            size: this.size,
          };
        }
      } else if (insertPosition === "end") {
        sortSet.push([rowIndex, sortValue, 0]);
        // TODO work out if within viewport
        return {
          rows: [],
          size: this.size,
        };
      } else {
        // for now
        return {
          rows: [],
          size: this.size,
        };
      }
    } else {
      throw Error("only support insert into no-filter rowsets at the moment");
    }
  }
}
