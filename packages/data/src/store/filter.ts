import { VuuFilter } from "@vuu-ui/data-types";
import type { Filter } from "@vuu-ui/vuu-filter-types";

export const EQUALS = "EQ";
export const GREATER_THAN = "GT";
export const GREATER_EQ = "GE";
export const LESS_THAN = "LT";
export const LESS_EQ = "LE";
export const AND = "AND";
export const OR = "OR";
export const STARTS_WITH = "SW";
export const NOT_STARTS_WITH = "NOT_SW";
export const IN = "IN";
export const NOT_IN = "NOT_IN";

export const SET_FILTER_DATA_COLUMNS = [
  { name: "name", key: 0 },
  { name: "count", key: 1, width: 40, type: "number" },
  { name: "totalCount", key: 2, width: 40, type: "number" },
];

export const BIN_FILTER_DATA_COLUMNS = [
  { name: "bin" },
  { name: "count" },
  { name: "bin-lo" },
  { name: "bin-hi" },
];

export type FilterSet = number[];

export const filterHasChanged = (oldFilter: VuuFilter, newFilter: VuuFilter) =>
  oldFilter !== newFilter;

export function getFilterColumn(column) {
  return column.isGroup ? column.columns[0] : column;
}

export function shouldShowFilter(filterColumnName, column) {
  const filterColumn = getFilterColumn(column);
  if (filterColumn.isGroup) {
    return filterColumn.columns.some((col) => col.name === filterColumnName);
  } else {
    return filterColumnName === filterColumn.name;
  }
}

export function includesNoValues(filter) {
  // TODO make sure we catch all cases...
  if (!filter) {
    return false;
  } else if (filter.type === IN && filter.values.length === 0) {
    return true;
  } else if (
    filter.type === AND &&
    filter.filters.some((f) => includesNoValues(f))
  ) {
    return true;
  } else {
    return false;
  }
}

function includesAllValues(filter) {
  if (!filter) {
    return false;
  } else if (filter.type === NOT_IN && filter.values.length === 0) {
    return true;
  } else if (filter.type === STARTS_WITH && filter.value === "") {
    return true;
  } else {
    return false;
  }
}

// does filter only narrow the resultset from existingFilter
export function extendsExistingFilter(filter: Filter, existingFilter?: Filter) {
  // ignore filters which are identical
  // include or exclude filters which add values
  if (existingFilter === undefined) {
    return false;
  }
  if (filter.colName && filter.colName === existingFilter.colName) {
    if (filter.type === existingFilter.type) {
      switch (filter.type) {
        case IN:
          return (
            existingFilter.values.length < filter.values.length &&
            containsAll(filter.values, existingFilter.values)
          );
        case NOT_IN:
          return (
            existingFilter.values.length > filter.values.length &&
            containsAll(existingFilter.values, filter.values)
          );
        case STARTS_WITH:
          return (
            existingFilter.value.length > filter.value.length &&
            existingFilter.value.indexOf(filter.value) === 0
          );
        // more cases here such as GT,LT
        default:
      }
    }
  } else if (filter.colname && existingFilter.colName) {
    // different columns,always false
    return false;
  } else if (
    existingFilter.type === AND &&
    extendsFilters(filter, existingFilter)
  ) {
    return true;
  }

  // safe option is to assume false, causing filter to be re-applied to base data
  return false;
}

const byColName = (a, b) =>
  a.colName === b.colName ? 0 : a.colName < b.colName ? -1 : 1;

function extendsFilters(f1, f2) {
  if (f1.colName) {
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

export function addFilter(existingFilter, filter) {
  if (includesNoValues(filter)) {
    const { colName } = filter;
    existingFilter = removeFilterForColumn(existingFilter, { name: colName });
  } else if (includesAllValues(filter)) {
    // A filter that returns all values is a way to remove filtering for this column
    return removeFilterForColumn(existingFilter, { name: filter.colName });
  }

  if (!existingFilter) {
    return filter;
  } else if (!filter) {
    return existingFilter;
  }

  if (existingFilter.type === AND && filter.type === AND) {
    return {
      type: "AND",
      filters: combine(existingFilter.filters, filter.filters),
    };
  } else if (existingFilter.type === "AND") {
    const filters = replaceOrInsert(existingFilter.filters, filter);
    return filters.length > 1 ? { type: "AND", filters } : filters[0];
  } else if (filter.type === "AND") {
    return { type: "AND", filters: filter.filters.concat(existingFilter) };
  } else if (filterEquals(existingFilter, filter, true)) {
    return filter;
  } else if (sameColumn(existingFilter, filter)) {
    return merge(existingFilter, filter);
  } else {
    return { type: "AND", filters: [existingFilter, filter] };
  }
}

// If we add an IN filter and there is an existing NOT_IN, we would always expect the IN
// values to exist in the NOT_IN set (as long as user interaction is driving the filtering)
function replaceOrInsert(filters, filter) {
  const { type, colName, values } = filter;
  if (type === IN || type === NOT_IN) {
    const otherType = type === IN ? NOT_IN : IN;
    // see if we have an 'other' entry
    let idx = filters.findIndex(
      (f) => f.type === otherType && f.colName === colName
    );
    if (idx !== -1) {
      const { values: existingValues } = filters[idx];
      if (values.every((value) => existingValues.indexOf(value) !== -1)) {
        if (values.length === existingValues.length) {
          // we simply remove the existing 'other' filter ...
          return filters.filter((f, i) => i !== idx);
        } else {
          // ... or strip the matching values from the 'other' filter values
          let newValues = existingValues.filter(
            (value) => !values.includes(value)
          );
          return filters.map((filter, i) =>
            i === idx ? { ...filter, values: newValues } : filter
          );
        }
      } else if (values.some((value) => existingValues.indexOf(value) !== -1)) {
        console.log(`partial overlap between IN and NOT_IN`);
      }
    } else {
      idx = filters.findIndex(
        (f) => f.type === type && f.colName === filter.colName
      );
      if (idx !== -1) {
        return filters.map((f, i) => (i === idx ? merge(f, filter) : f));
      }
    }
  }

  return filters.concat(filter);
}

function merge(f1, f2) {
  const { type: t1 } = f1;
  const { type: t2 } = f2;
  const sameType = t1 === t2 ? t1 : "";

  if (includesNoValues(f2)) {
    return f2;
  } else if ((t1 === IN && t2 === NOT_IN) || (t1 === NOT_IN && t2 === IN)) {
    // do the two sets cancel each other out ?
    if (
      f1.values.length === f2.values.length &&
      f1.values.every((v) => f2.values.includes(v))
    ) {
      if (t1 === IN && t2 === NOT_IN) {
        return {
          colName: f1.colName,
          type: IN,
          values: [],
        };
      } else {
        return null;
      }
      return null;
    } else if (f1.values.length > f2.values.length) {
      if (f2.values.every((v) => f1.values.includes(v))) {
        return {
          ...f1,
          values: f1.values.filter((v) => !f2.values.includes(v)),
        };
      }
    }
  } else if (sameType === IN || sameType === NOT_IN) {
    return {
      ...f1,
      values: f1.values.concat(f2.values.filter((v) => !f1.values.includes(v))),
    };
  } else if (sameType === STARTS_WITH) {
    return {
      type: OR,
      filters: [f1, f2],
    };
  } else if (sameType === NOT_STARTS_WITH) {
    return {
      type: AND,
      filters: [f1, f2],
    };
  }

  return f2;
}

function combine(existingFilters, replacementFilters) {
  // TODO need a safer REGEX here
  function equivalentType({ type: t1 }, { type: t2 }) {
    return t1 === t2 || t1[0] === t2[0];
  }

  const replaces = (existingFilter, replacementFilter) => {
    return (
      existingFilter.colName === replacementFilter.colName &&
      equivalentType(existingFilter, replacementFilter)
    );
  };

  const stillApplicable = (existingFilter) =>
    replacementFilters.some((replacementFilter) =>
      replaces(existingFilter, replacementFilter)
    ) === false;

  return existingFilters.filter(stillApplicable).concat(replacementFilters);
}

export function removeFilter(sourceFilter, filterToRemove) {
  if (filterEquals(sourceFilter, filterToRemove, true)) {
    return null;
  } else if (sourceFilter.type !== AND) {
    throw Error(
      `removeFilter cannot remove ${JSON.stringify(
        filterToRemove
      )} from ${JSON.stringify(sourceFilter)}`
    );
  } else {
    const filters = sourceFilter.filters.filter(
      (f) => !filterEquals(f, filterToRemove)
    );
    return filters.length > 0 ? { type: AND, filters } : null;
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
