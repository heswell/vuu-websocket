import { VuuDataRow, VuuSortCol } from "@vuu-ui/vuu-protocol-types";
import { SortComparator, sort, sortExtend, SortSet } from "./sortUtils";
import { Table } from "./table";

const sortIndex: SortComparator = ([a1], [b1]) =>
  a1 > b1 ? 1 : b1 > a1 ? -1 : 0;

/**
 * Map of row key value to row index position
 */
export type KeyToIndexMap = Map<string, number>;

/**
 *
 */
export class SortedIndex {
  #filterSet: number[] | undefined;
  #sortSet: SortSet;
  #sortKeyMap: KeyToIndexMap = new Map();
  #filterKeyMap: KeyToIndexMap = new Map();
  #table: Table;

  constructor(table: Table) {
    this.#table = table;
    this.#sortSet = this.buildSortSet(table.rows);
    this.setMapKeys(this.#sortKeyMap, this.#sortSet);
  }

  get keys() {
    return this.#filterSet ?? this.#sortSet;
  }

  get keyMap() {
    return this.#filterSet ? this.#filterKeyMap : this.#sortKeyMap;
  }

  get length() {
    return this.#filterSet?.length ?? this.#sortSet.length;
  }

  get filterSet() {
    return this.#filterSet;
  }

  set filterSet(filterSet: number[] | undefined) {
    if (filterSet) {
      this.setMapKeys(this.#filterKeyMap, this.#sortSet, filterSet);
    } else {
      this.#filterKeyMap.clear();
    }
    this.#filterSet = filterSet;
  }

  get sortSet() {
    return this.#sortSet;
  }

  get filterKeyMap() {
    return this.#filterKeyMap;
  }

  get sortKeyMap() {
    return this.#sortKeyMap;
  }

  sort(sortCols: VuuSortCol[]) {
    const { columnMap, rows } = this.#table;
    sort(this.#sortSet, rows, sortCols, columnMap);
    this.setMapKeys(this.#sortKeyMap, this.#sortSet);
  }

  extendSort(sortCols: VuuSortCol[]) {
    const { columnMap, rows } = this.#table;
    sortExtend(this.#sortSet, rows, sortCols, columnMap);
    this.setMapKeys(this.#sortKeyMap, this.#sortSet);
  }

  revertSort() {
    this.#sortSet.sort(sortIndex);
    this.setMapKeys(this.#sortKeyMap, this.#sortSet);
  }

  reverseSortSet() {
    this.#sortSet.reverse();
    this.setMapKeys(this.#sortKeyMap, this.#sortSet);
  }

  /**
   * Initialise an empty sortset,
   * allowing for two sort columns.
   * We are only currently supporting one or two columns sorting.
   * TODO mechanism for > 2 column sort
   * populate map of row key values to sortSet index positions
   */
  private buildSortSet(rows: VuuDataRow[]) {
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

  private setMapKeys(
    keyMap: Map<string, number>,
    sortSet: SortSet,
    filterSet?: number[]
  ) {
    const { columnMap, rows, schema } = this.#table;
    const indexOfKeyField = columnMap[schema.key];

    keyMap.clear();

    if (filterSet) {
      for (let i = 0; i < filterSet.length; i++) {
        const sortSetIndexIndex = filterSet[i];
        const [rowIndex] = sortSet[sortSetIndexIndex];
        const keyValue = rows[rowIndex][indexOfKeyField];
        keyMap.set(keyValue.toString(), i);
      }
    } else {
      for (let i = 0; i < sortSet.length; i++) {
        const [rowIndex] = sortSet[i];
        const keyValue = rows[rowIndex][indexOfKeyField] as string;
        if (keyMap.has(keyValue)) {
          throw Error(`duplicate key value ${keyValue}`);
        }
        keyMap.set(keyValue, i);
      }
    }
  }
}
