/**
 * Keep all except for groupRowset in this file to avoid circular reference warnings
 */
import { TableColumn } from "@heswell/server-types";
import { Filter } from "@vuu-ui/vuu-filter-types";
import { filterPredicate } from "@vuu-ui/vuu-filter-parser";
import type {
  VuuDataRow,
  VuuRange,
  VuuRow,
  VuuSortCol,
} from "@vuu-ui/vuu-protocol-types";
import { projectColumns } from "../columnUtils.ts";
import { extendsExistingFilter } from "../filter.ts";
import { getDeltaRange, getFullRange } from "../rangeUtils.ts";
import {
  ASC,
  SortSet,
  mapSortDefsToSortCriteria,
  revertToIndexSort,
  sort,
  sortBy,
  sortExtend,
  sortExtendsExistingSort,
  SortItem,
  sortPosition,
  sortRemoved,
  sortReversed,
} from "../sortUtils.ts";
import { Table, UpdateTuples } from "../table.ts";
import { DataResponse } from "./IRowSet.ts";
import { BaseRowSet } from "./BaseRowSet.ts";

const SINGLE_COLUMN = 1;

const NO_OPTIONS: RowSetConstructorOptions = {};

export type RowSetConstructorOptions = {
  filter?: Filter;
  range?: VuuRange;
  sortSet?: SortSet;
};

export class RowSet extends BaseRowSet {
  // TODO stream as above
  // static fromGroupRowSet({ table, columns, currentFilter: filter }) {
  //   return new RowSet(table, columns, {
  //     filter,
  //   });
  // }
  //TODO consolidate API of rowSet, groupRowset
  constructor(
    viewportId: string,
    table: Table,
    columns: TableColumn[],
    { filter, range, sortSet }: RowSetConstructorOptions = NO_OPTIONS
  ) {
    super(viewportId, table, columns);
    const keyFieldIndex = table.columnMap[table.schema.key];
    this.project = projectColumns(keyFieldIndex, this.viewportId);
    this.sortSet = sortSet ?? this.buildSortSet();
    this.setMapKeys(this.sortedIndex, this.sortSet);

    if (range) {
      this.range = range;
    }

    if (filter) {
      this.currentFilter = filter;
      this.filter(filter);
    }
  }

  /**
   *
   * Initialise an empty sortset,
   * allowing for two sort columns.
   * We are only currently supporting one or two columns sorting.
   * TODO mechanism for > 2 column sort
   * populate map of row key values to sortSet index positions
   */
  buildSortSet() {
    const { rows } = this.table;
    const sortSet: SortSet = Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      // this is the initial, unsorted state, where rowIndex value
      // (first item of sortSet tuple) equals rowIndex value from data)
      // and is same as natural array position. The latter will no longer
      // be true once data is sorted.
      sortSet[i] = [i, 0, 0];
    }
    return sortSet;
  }

  setMapKeys(
    keyMap: Map<string, number>,
    sortSet: SortSet,
    filterSet?: number[]
  ) {
    const { table, indexOfKeyField } = this;

    if (filterSet) {
      for (let i = 0; i < filterSet.length; i++) {
        const sortSetIndexIndex = filterSet[i];
        const [rowIndex] = sortSet[sortSetIndexIndex];
        const keyValue = table.rows[rowIndex][indexOfKeyField];
        keyMap.set(keyValue.toString(), i);
      }
    } else {
      for (let i = 0; i < sortSet.length; i++) {
        const [rowIndex] = sortSet[i];
        const keyValue = table.rows[rowIndex][indexOfKeyField] as string;
        if (keyMap.has(keyValue)) {
          throw Error(`duplicate key value ${keyValue}`);
        }
        keyMap.set(keyValue, i);
      }
    }
  }

  setRange(range = this.range, useDelta = true): DataResponse {
    const { from, to } = useDelta
      ? getDeltaRange(this.range, range)
      : getFullRange(range);
    const resultset = this.slice(from, to);
    this.range = range;
    return {
      rows: resultset,
      size: this.size,
    };
  }

  currentRange(): DataResponse {
    const { from, to } = this.range;
    console.log(`currentRange ${from} - ${to}`);
    const resultset = this.slice(from, to);
    return {
      rows: resultset,
      size: this.size,
    };
  }

  slice(lo: number, hi: number) {
    const { table, filterSet, selected, sortSet } = this;

    const indexSet = filterSet ?? sortSet;
    const getRowIndex = filterSet
      ? (idx: number) => sortSet[filterSet[idx]][0]
      : (idx: number) => sortSet[idx][0];

    const results: VuuRow[] = [];
    const projectRow = this.project(selected, this.size);

    for (let i = lo, len = indexSet.length; i < len && i < hi; i++) {
      const rowIndex = getRowIndex(i);
      results.push(projectRow(table.rows[rowIndex], i));
    }

    return results;
  }

  get size() {
    return this.filterSet?.length ?? this.sortSet.length;
  }

  get first() {
    return this.table.rows[0];
  }
  get last() {
    return this.table.rows.at(-1);
  }
  get rawData() {
    return this.table.rows;
  }

  sort(sortCols: VuuSortCol[]) {
    const start = performance.now();
    const { table, filterSet, sortSet } = this;
    const { columnMap } = this._table;

    if (sortRemoved(this.sortCols, sortCols)) {
      revertToIndexSort(sortSet);
    } else if (sortReversed(this.sortCols, sortCols, SINGLE_COLUMN)) {
      sortSet.reverse();
      this.setMapKeys(this.sortedIndex, sortSet);
    } else if (sortExtendsExistingSort(this.sortCols, sortCols)) {
      sortExtend(sortSet, table.rows, sortCols, columnMap);
    } else {
      sort(sortSet, table.rows, sortCols, columnMap);
    }

    this.sortCols = sortCols;
    this.setMapKeys(this.sortedIndex, sortSet);

    if (filterSet && this.currentFilter) {
      const fn = filterPredicate(columnMap, this.currentFilter);

      const indexSet = sortSet;
      const getRowIndex = (idx: number) => sortSet[idx][0];
      const newFilterSet: number[] = [];

      for (let i = 0; i < indexSet.length; i++) {
        const rowIdx = getRowIndex(i);
        const row = table.rows[rowIdx];
        if (fn(row)) {
          newFilterSet.push(i);
        }
      }

      this.setMapKeys(this.filterKeyMap, this.sortSet, newFilterSet);

      this.filterSet = newFilterSet;
    }
    const end = performance.now();
    console.log(`sort took ${end - start} ms`);
  }

  clearFilter() {
    this.currentFilter = undefined;
    this.filterSet = undefined;
  }

  filter(filter: Filter) {
    const { columnMap } = this._table;

    const start = performance.now();
    const extendsCurrentFilter = extendsExistingFilter(
      filter,
      this.currentFilter
    );

    const fn = filterPredicate(columnMap, filter);
    const { table, filterSet, sortSet } = this;

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
        newFilterSet.push(rowIdx);
      }
    }

    this.setMapKeys(this.filterKeyMap, this.sortSet, newFilterSet);

    this.filterSet = newFilterSet;
    this.currentFilter = filter;

    const end = performance.now();
    console.log(`filter took ${end - start} ms`);
  }

  update(rowIndex: number, updates: UpdateTuples) {
    if (this.currentFilter === null && this.sortCols === null) {
      if (rowIndex >= this.range.from && rowIndex < this.range.to) {
        return [rowIndex, ...updates];
      }
    } else if (this.currentFilter === null) {
      const { sortSet } = this;
      for (let i = this.range.from; i < this.range.to; i++) {
        const [rowIdx] = sortSet[i];
        if (rowIdx === rowIndex) {
          return [i, ...updates];
        }
      }
    } else if (this.filterSet) {
      // sorted AND/OR filtered
      for (let i = this.range.from; i < this.range.to; i++) {
        //TODO this is an index into sortSet not directly into data
        const rowIdx = this.filterSet[i];
        if (rowIdx === rowIndex) {
          return [i, ...updates];
        }
      }
    }
  }

  insert(rowIndex: number, row: VuuDataRow) {
    const { columnMap } = this._table;

    // TODO multi colun sort sort DSC
    if (this.sortCols === null && this.currentFilter === undefined) {
      // simplest scenario, row will be at end of sortset ...
      this.sortSet.push([rowIndex, 0, 0]);
      if (rowIndex >= this.range.to) {
        // ... row is beyond viewport
        return {
          size: this.size,
        };
      } else {
        // ... row is within viewport
        return {
          size: this.size,
          replace: true,
        };
      }
    } else if (this.currentFilter === undefined) {
      // sort only - currently only support single column sorting
      const sortCols = mapSortDefsToSortCriteria(
        this.sortCols,
        this._table.columnMap
      );
      const [[colIdx]] = sortCols;
      const sortRow: SortItem = [rowIndex, row[colIdx], 0];
      const sorter = sortBy([[1, ASC]]); // the sortSet is always ascending
      const sortPos = sortPosition(
        this.sortSet,
        sorter,
        sortRow,
        "last-available"
      );
      this.sortSet.splice(sortPos, 0, sortRow);

      const viewportPos = sortPos;

      if (viewportPos >= this.range.to) {
        return {
          size: this.size,
        };
      } else if (viewportPos >= this.range.from) {
        return {
          size: this.size,
          replace: true,
        };
      } else {
        return {
          size: this.size,
        };
      }
    } else if (this.sortCols === undefined) {
      // filter only
      const fn = filterPredicate(columnMap, this.currentFilter);
      if (fn(row)) {
        const navIdx = this.filterSet?.length;
        this.filterSet?.push(rowIndex);
        if (navIdx >= this.range.to) {
          // ... row is beyond viewport
          return {
            size: this.size,
          };
        } else if (navIdx >= this.range.from) {
          // ... row is within viewport
          return {
            size: this.size,
            replace: true,
          };
        } else {
          return {
            size: this.size,
          };
        }
      } else {
        return {};
      }
    } else {
      // sort AND filter
      const fn = filterPredicate(columnMap, this.currentFilter);
      if (fn(row)) {
        // TODO what about totalCOunt

        const sortCols = mapSortDefsToSortCriteria(
          this.sortCols,
          this.table.columnMap
        );
        const [[colIdx, direction]] = sortCols; // TODO multi-colun sort
        const sortRow = [rowIndex, row[colIdx]];
        const sorter = sortBy([[1, direction]]); // TODO DSC
        const navIdx = sortPosition(
          this.filterSet,
          sorter,
          sortRow,
          "last-available"
        );
        this.filterSet.splice(navIdx, 0, sortRow);

        if (navIdx >= this.range.to) {
          // ... row is beyond viewport
          return {
            size: this.size,
          };
        } else if (navIdx >= this.range.from) {
          // ... row is within viewport
          return {
            size: this.size,
            replace: true,
          };
        } else {
          return {
            size: this.size,
          };
        }
      } else {
        return {};
      }
    }
  }
}
