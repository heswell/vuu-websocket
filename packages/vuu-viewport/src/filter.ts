import type { ColumnMap, VuuDataRow } from "@heswell/vuu-table";
import type { Filter } from "@vuu-ui/vuu-filter-types";
import type { VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import { parseFilter } from "@vuu-ui/vuu-filter-parser";
import type { RowPredicate } from "./types.ts";

const rejectAll: RowPredicate = () => false;

type FilterValue = VuuRowDataItemType | { asLong: unknown };

const normalizeValue = (value: FilterValue): VuuRowDataItemType => {
  if (value !== null && typeof value === "object" && "asLong" in value) {
    return value.asLong as VuuRowDataItemType;
  }
  return value as VuuRowDataItemType;
};

/**
 * Compile a Filter AST into a fast row predicate. Column positions and
 * filter values are resolved once, at compile time.
 */
export function compileFilter(
  filter: Filter,
  columnMap: ColumnMap,
): RowPredicate {
  if (filter.op === "and" || filter.op === "or") {
    const predicates = filter.filters.map((f) => compileFilter(f, columnMap));
    if (predicates.length === 1) return predicates[0];
    if (predicates.length === 2) {
      const [p1, p2] = predicates;
      return filter.op === "and"
        ? (row) => p1(row) && p2(row)
        : (row) => p1(row) || p2(row);
    }
    if (filter.op === "and") {
      return (row) => {
        for (let i = 0; i < predicates.length; i++) {
          if (!predicates[i](row)) return false;
        }
        return true;
      };
    }
    return (row) => {
      for (let i = 0; i < predicates.length; i++) {
        if (predicates[i](row)) return true;
      }
      return false;
    };
  }

  const clause = filter as {
    column: string;
    op: string;
    value?: unknown;
    values?: unknown[];
  };
  const idx = columnMap[clause.column];
  if (idx === undefined) {
    console.warn(`[compileFilter] unknown column ${clause.column}`);
    return rejectAll;
  }

  if (filter.op === "in") {
    const values = new Set<VuuRowDataItemType>(
      (filter.values as FilterValue[]).map(normalizeValue),
    );
    return (row) => values.has(row[idx]);
  }

  const value = normalizeValue(clause.value as FilterValue);
  switch (filter.op) {
    case "=":
      return (row) => row[idx] === value;
    case "!=":
      return (row) => row[idx] !== value;
    case ">":
      return (row) => (row[idx] as number) > (value as number);
    case ">=":
      return (row) => (row[idx] as number) >= (value as number);
    case "<":
      return (row) => (row[idx] as number) < (value as number);
    case "<=":
      return (row) => (row[idx] as number) <= (value as number);
    case "starts": {
      const pattern = String(value).toLowerCase();
      return (row) => {
        const v = row[idx];
        return typeof v === "string" && v.toLowerCase().startsWith(pattern);
      };
    }
    case "ends": {
      const pattern = String(value).toLowerCase();
      return (row) => {
        const v = row[idx];
        return typeof v === "string" && v.toLowerCase().endsWith(pattern);
      };
    }
    case "contains": {
      const pattern = String(value).toLowerCase();
      return (row) => {
        const v = row[idx];
        return typeof v === "string" && v.toLowerCase().includes(pattern);
      };
    }
    default:
      console.warn(`[compileFilter] unsupported filter op ${filter.op}`);
      return rejectAll;
  }
}

/**
 * Parse a Vuu filter query (e.g. 'ccy = "EUR" and price > 100').
 * Returns undefined for an empty query, rejectAll if the query is invalid.
 */
export function parseAndCompileFilter(
  query: string,
  columnMap: ColumnMap,
): { filter: Filter; predicate: RowPredicate } | undefined {
  if (query.trim() === "") {
    return undefined;
  }
  try {
    const filter = parseFilter(query);
    return { filter, predicate: compileFilter(filter, columnMap) };
  } catch (err) {
    console.warn(`[parseAndCompileFilter] invalid filter "${query}"`);
    return {
      filter: { op: "=", column: "", value: "" } as Filter,
      predicate: rejectAll,
    };
  }
}

const filterEquals = (f1: Filter, f2: Filter) =>
  JSON.stringify(f1) === JSON.stringify(f2);

/**
 * True if every row accepted by newFilter is also accepted by oldFilter,
 * determined structurally (newFilter = oldFilter AND something). When true
 * the existing filtered (and sorted) index can be narrowed in place.
 */
export function filterNarrows(
  newFilter: Filter | undefined,
  oldFilter: Filter | undefined,
) {
  if (newFilter === undefined) return false;
  if (oldFilter === undefined) return true;
  if (newFilter.op !== "and") return false;
  if (oldFilter.op === "and") {
    return oldFilter.filters.every((f) =>
      newFilter.filters.some((nf) => filterEquals(f, nf)),
    );
  }
  return newFilter.filters.some((f) => filterEquals(f, oldFilter));
}
