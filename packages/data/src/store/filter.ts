import type {
  Filter,
  FilterClause,
  MultiClauseFilter,
  SingleValueFilterClause,
} from "@vuu-ui/vuu-filter-types";
import { VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import {
  isFilterClause,
  isInFilter,
  isSingleValueFilter,
} from "@vuu-ui/vuu-utils";

export const SET_FILTER_DATA_COLUMNS = [
  { name: "name", key: 0 },
  { name: "count", key: 1, width: 40, type: "number" },
  { name: "totalCount", key: 2, width: 40, type: "number" },
];

const isStartsClause = (
  f?: Partial<Filter>
): f is SingleValueFilterClause<string> => f?.op === "starts";

// does filter only narrow the resultset from existingFilter
export function extendsExistingFilter(filter: Filter, existingFilter?: Filter) {
  // ignore filters which are identical
  // include or exclude filters which add values
  if (existingFilter === undefined) {
    return false;
  }
  if (filter.column && filter.column === existingFilter.column) {
    if (isInFilter(existingFilter) && isInFilter(filter)) {
      return (
        existingFilter.values.length < filter.values.length &&
        containsAll(filter.values, existingFilter.values)
      );
    }
    if (isStartsClause(filter) && isStartsClause(existingFilter)) {
      return (
        existingFilter.value.length > filter.value.length &&
        existingFilter.value.indexOf(filter.value) === 0
      );
    }
  } else if (filter.column && existingFilter.column) {
    // different columns,always false
    return false;
  } else if (
    existingFilter.op === "and" &&
    extendsFilters(filter, existingFilter)
  ) {
    return true;
  }

  // safe option is to assume false, causing filter to be re-applied to base data
  return false;
}

const byColName = (
  { column: cola = "" }: Filter,
  { column: colb = "" }: Filter
) => (cola === colb ? 0 : cola < colb ? -1 : 1);

function extendsFilters(f1: Filter, { filters }: MultiClauseFilter) {
  if (isFilterClause(f1)) {
    const matchingFilter = filters.find((f) => f.column === f1.column);
    return (
      isFilterClause(matchingFilter) && filterEquals(matchingFilter, f1, true)
    );
  } else if (f1.filters.length === filters.length) {
    // if the only differences are fewer values in an includes filter
    // then we are still extending the filter (i.e. narrowing the resultset)
    const a = f1.filters.toSorted(byColName);
    const b = filters.toSorted(byColName);

    for (let i = 0; i < a.length; i++) {
      if (!filterEquals(a[i], b[i], true) && !filterExtends(a[i], b[i])) {
        return false;
      }
    }
    return true;
  } else if (filters.length > f1.filters.length) {
    return f1.filters.every((filter1) => {
      const filter2 = filters.find((f) => f.column === filter1.column);
      return filter2 && filterEquals(filter1, filter2, true);
    });
  }
}

const sameColumn = (f1: FilterClause, f2: FilterClause) =>
  f1.column === f2.column;

const valueOf = (filterClause: FilterClause) =>
  isSingleValueFilter(filterClause) ? filterClause.value : filterClause.values;

export function filterEquals(f1: Filter, f2: Filter, strict = false) {
  if (isFilterClause(f1) && isFilterClause(f2)) {
    const isSameColumn = sameColumn(f1, f2);
    if (!strict) {
      return isSameColumn;
    } else {
      return (
        isSameColumn &&
        f1.op === f2.op &&
        isSingleValueFilter() &&
        sameValues(f1, f2)
      );
    }
  }
  if (f1 && f1) {
  } else {
    return false;
  }
}

// does f2 extend f1 ?
function filterExtends(f1: Filter, f2: Filter) {
  if (f1.op === "in" && f2.op === "in") {
    return (
      f2.values.length < f1.values.length && containsAll(f1.values, f2.values)
    );
  } else {
    return false;
  }
}

// The folowing are array utilities but they are defined here as they are not suitable for large arrays, so we'll
// keep them local to filters
function containsAll(
  superList: VuuRowDataItemType[],
  subList: VuuRowDataItemType[]
) {
  for (let i = 0, len = subList.length; i < len; i++) {
    if (superList.indexOf(subList[i]) === -1) {
      return false;
    }
  }
  return true;
}

// only suitable for small arrays of simple types (e.g. filter values)
function sameValues(f1: FilterClause, f2: FilterClause) {
  const v1 = valueOf(f1);
  const v2 = valueOf(f2);
  if (v1 === v2) {
    return true;
  } else if (Array.isArray(v1) && Array.isArray(v2)) {
    if (v1 === v2) {
      return true;
    } else if (v1.length === v2.length) {
      const a = v1.toSorted();
      const b = v2.toSorted();
      return a.join("|") === b.join("|");
    }
  } else {
    return false;
  }
}
