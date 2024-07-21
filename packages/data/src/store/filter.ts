import type { Filter, SingleValueFilterClause } from "@vuu-ui/vuu-filter-types";
import { isInFilter } from "@vuu-ui/vuu-utils";

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

const byColName = (a, b) =>
  a.colName === b.colName ? 0 : a.colName < b.colName ? -1 : 1;

function extendsFilters(f1: Filter, f2: Filter) {
  if (f1.column) {
    const matchingFilter = f2.filters.find((f) => f.colName === f1.colName);
    return filterEquals(matchingFilter, f1, true);
  } else if (f1.filters.length === f2.filters.length) {
    // if the only differences are extra values in an excludes filter or fewer values in an includes filter
    // then we are still extending the filter (i.e. narrowing the resultset)
    const a = f1.filters.sort(byColName);
    const b = f2.filters.slice().sort(byColName);

    for (let i = 0; i < a.length; i++) {
      if (!filterEquals(a[i], b[i], true) && !filterExtends(a[i], b[i])) {
        return false;
      }
    }
    return true;
  } else if (f2.filters.length > f1.filters.length) {
    return f1.filters.every((filter1) => {
      const filter2 = f2.filters.find((f) => f.colName === filter1.colName);
      return filterEquals(filter1, filter2, true); // could also allow f2 extends f1
    });
  }
}

export function splitFilterOnColumn(filter, columnName) {
  if (!filter) {
    return [null, null];
  } else if (filter.colName === columnName) {
    return [filter, null];
  } else if (filter.type !== "AND") {
    return [null, filter];
  } else {
    const [[columnFilter = null], filters] = partition(
      filter.filters,
      (f) => f.colName === columnName
    );
    return filters.length === 1
      ? [columnFilter, filters[0]]
      : [columnFilter, { type: "AND", filters }];
  }
}

export const overrideColName = (filter: any, colName: string) => {
  const { type } = filter;
  if (type === AND || type === OR) {
    return {
      type,
      filters: filter.filters.map((f) => overrideColName(f, colName)),
    };
  } else {
    return { ...filter, colName };
  }
};

export function extractFilterForColumn(filter, columnName) {
  if (!filter) {
    return null;
  }
  const { type, colName } = filter;
  switch (type) {
    case AND:
    case OR:
      return collectFiltersForColumn(type, filter.filters, columnName);

    default:
      return colName === columnName ? filter : null;
  }
}

function collectFiltersForColumn(type, filters, columName) {
  const results = [];
  filters.forEach((filter) => {
    const ffc = extractFilterForColumn(filter, columName);
    if (ffc !== null) {
      results.push(ffc);
    }
  });
  if (results.length === 1) {
    return results[0];
  } else {
    return {
      type,
      filters: results,
    };
  }
}

export function includesColumn(filter, column) {
  if (!filter) {
    return false;
  }
  const { type, colName, filters } = filter;
  switch (type) {
    case AND:
      return filters.some((f) => includesColumn(f, column));
    default:
      return colName === column.name;
  }
}

export function removeFilterForColumn(sourceFilter, column) {
  const colName = column.name;
  if (!sourceFilter) {
    return null;
  } else if (sourceFilter.colName === colName) {
    return null;
  } else if (sourceFilter.type === AND || sourceFilter.type === OR) {
    const { type, filters } = sourceFilter;
    const otherColFilters = filters.filter((f) => f.colName !== colName);
    switch (otherColFilters.length) {
      case 0:
        return null;
      case 1:
        return otherColFilters[0];
      default:
        return { type, otherColFilters };
    }
  } else {
    return sourceFilter;
  }
}

const sameColumn = (f1, f2) => f1.colName === f2.colName;

export function filterEquals(f1, f2, strict = false) {
  if (f1 && f1) {
    const isSameColumn = sameColumn(f1, f2);
    if (!strict) {
      return isSameColumn;
    } else {
      return (
        isSameColumn &&
        f1.type === f2.type &&
        f1.mode === f2.mode &&
        f1.value === f2.value &&
        sameValues(f1.values, f2.values)
      );
    }
  } else {
    return false;
  }
}

// does f2 extend f1 ?
function filterExtends(f1, f2) {
  if (f1.type === IN && f2.type === IN) {
    return (
      f2.values.length < f1.values.length && containsAll(f1.values, f2.values)
    );
  } else if (f1.type === NOT_IN && f2.type === NOT_IN) {
    return (
      f2.values.length > f1.values.length && containsAll(f2.values, f1.values)
    );
  } else {
    return false;
  }
}

//TODO roll this into next function
export function projectFilterData(filterRows) {
  return filterRows.map((row, idx) => [idx, 0, 0, null, row.name, row.count]);
}

// The folowing are array utilities but they are defined here as they are not suitable for large arrays, so we'll
// keep them local to filters
function containsAll(superList, subList) {
  for (let i = 0, len = subList.length; i < len; i++) {
    if (superList.indexOf(subList[i]) === -1) {
      return false;
    }
  }
  return true;
}

// only suitable for small arrays of simple types (e.g. filter values)
function sameValues(arr1, arr2) {
  if (arr1 === arr2) {
    return true;
  } else if (arr1.length === arr2.length) {
    const a = arr1.slice().sort();
    const b = arr2.slice().sort();
    return a.join("|") === b.join("|");
  }
  return false;
}

export function partition(list, test1, test2 = null) {
  const results1 = [];
  const misses = [];
  const results2 = test2 === null ? null : [];

  for (let i = 0; i < list.length; i++) {
    if (test1(list[i])) {
      results1.push(list[i]);
    } else if (test2 !== null && test2(list[i])) {
      results2.push(list[i]);
    } else {
      misses.push(list[i]);
    }
  }

  return test2 === null ? [results1, misses] : [results1, results2, misses];
}
