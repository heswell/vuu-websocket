import { mapSortDefsToSortCriteria, SortSet } from "@heswell/data";
import {
  VuuDataRow,
  VuuFilter,
  VuuRowDataItemType,
  VuuSort,
  VuuSortCol,
  VuuSortType,
} from "@vuu-ui/vuu-protocol-types";
import { ColumnMap } from "@vuu-ui/vuu-utils";

export type RestRange = {
  origin: number;
  limit: number;
};

const getSearchParam = (url: URL, property: string, defaultValue = "") =>
  url.searchParams.get(property) ?? defaultValue;

export const getRestRange = (url: URL) => {
  return {
    origin: parseInt(getSearchParam(url, "origin", "0")),
    limit: parseInt(getSearchParam(url, "limit", "100")),
  } as RestRange;
};

export type QueryFields = {
  filter?: VuuFilter;
  sort?: VuuSort;
};

export const getQueryFields = (url: URL) => {
  const queryFields: QueryFields = {};
  for (const [name, value] of url.searchParams) {
    console.log(`${name} = ${value}`);
    switch (name) {
      case "sort":
        queryFields.sort = buildSort(value);
        break;
      case "filter":
        queryFields.filter = buildFilter(value);
      default:
        console.log(`unknown query stringparameter ${name} = ${value}`);
    }
  }
  return queryFields;
};

const buildFilter = (filter: string): VuuFilter => {
  const filterString = filter.slice(1, -1);
  return { filter: filterString };
};

const buildSort = (sort: string): VuuSort => {
  const vuuSort: VuuSort = { sortDefs: [] };
  const sortCriteria = sort.slice(1, -1).split(",");
  for (let i = 0; i < sortCriteria.length; i += 2) {
    const column = sortCriteria[i];
    const sortType = sortCriteria[i + 1] as VuuSortType;
    vuuSort.sortDefs.push({ column, sortType });
  }

  return vuuSort;
};

export function getSortSet(
  rows: VuuDataRow[],
  sortDefs: VuuSortCol[],
  columnMap: ColumnMap
) {
  const sortCriteria = mapSortDefsToSortCriteria(sortDefs, columnMap);
  const [[columnIndex, sortType]] = sortCriteria;
  const sortSet: SortSet = Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    sortSet[i] = [i, rows[i][columnIndex]];
  }
  if (sortType === "A") {
    sortSet.sort(sort1A);
  } else {
    sortSet.sort(sort1D);
  }
  return sortSet;
}

type SortResult = 1 | 0 | -1;
type SortComparator<T = VuuRowDataItemType[]> = (a: T, b: T) => SortResult;

const sort1A: SortComparator = ([, a1 = 0], [, b1 = 0]) =>
  a1 > b1 ? 1 : b1 > a1 ? -1 : 0;
const sort1D: SortComparator = ([, a1 = 0], [, b1 = 0]) =>
  a1 > b1 ? -1 : b1 > a1 ? 1 : 0;
