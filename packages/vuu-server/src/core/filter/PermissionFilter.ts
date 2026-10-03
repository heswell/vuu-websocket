import type { RowPredicate } from "@heswell/data";
import type {
  VuuDataRow,
  VuuRowDataItemType,
} from "@vuu-ui/vuu-protocol-types";
import type { ColumnMap } from "@vuu-ui/vuu-utils";
import type { TableContainer } from "../table/TableContainer";
import type { Viewport } from "../../viewport/Viewport";

/**
 * Read access to a single row, by column name.
 */
export interface RowData {
  get: (columnName: string) => VuuRowDataItemType | undefined;
}

/**
 * Restricts the rows of a table visible through a viewport, typically
 * based on the user that owns the viewport. Permission filters are applied
 * in addition to any client filter.
 */
export interface PermissionFilter {
  /**
   * Bind this permission filter to the column layout of a table, returning a
   * predicate that can be evaluated against raw table rows.
   */
  createPredicate: (columnMap: ColumnMap) => RowPredicate;
}

/**
 * Creates the PermissionFilter for a viewport. Configured on a TableDef.
 */
export type PermissionFunction = (
  viewport: Viewport,
  tableContainer: TableContainer,
) => PermissionFilter;

const allowAll: RowPredicate = () => true;
const denyAll: RowPredicate = () => false;

export const AllowAllPermissionFilter: PermissionFilter = {
  createPredicate: () => allowAll,
};

export const DenyAllPermissionFilter: PermissionFilter = {
  createPredicate: () => denyAll,
};

class RowPermissionFilter implements PermissionFilter {
  constructor(private rowPredicate: (row: RowData) => boolean) {}

  createPredicate(columnMap: ColumnMap): RowPredicate {
    let currentRow: VuuDataRow = [];
    const rowData: RowData = {
      get: (columnName) => {
        const idx = columnMap[columnName];
        return idx === undefined ? undefined : currentRow[idx];
      },
    };
    return (row) => {
      currentRow = row;
      return this.rowPredicate(rowData);
    };
  }
}

/**
 * Rows are visible if the value in column is one of allowedValues. Values
 * are compared in their string form, allowedValues are always strings.
 */
class ContainsPermissionFilter implements PermissionFilter {
  constructor(
    private columnName: string,
    private allowedValues: Set<string>,
  ) {}

  createPredicate(columnMap: ColumnMap): RowPredicate {
    const idx = columnMap[this.columnName];
    if (idx === undefined || this.allowedValues.size === 0) {
      return denyAll;
    }
    const { allowedValues } = this;
    return (row) => {
      const value = row[idx];
      return (
        value !== undefined && value !== null && allowedValues.has(String(value))
      );
    };
  }
}

class PermissionFilterChain implements PermissionFilter {
  constructor(private filters: PermissionFilter[]) {}

  createPredicate(columnMap: ColumnMap): RowPredicate {
    const predicates = this.filters.map((f) => f.createPredicate(columnMap));
    return (row) => predicates.every((predicate) => predicate(row));
  }
}

export function PermissionFilter(
  rowPredicate: (row: RowData) => boolean,
): PermissionFilter;
export function PermissionFilter(
  columnName: string,
  allowedValues: Set<string>,
): PermissionFilter;
export function PermissionFilter(
  filters: Iterable<PermissionFilter>,
): PermissionFilter;
export function PermissionFilter(
  arg: ((row: RowData) => boolean) | string | Iterable<PermissionFilter>,
  allowedValues?: Set<string>,
): PermissionFilter {
  if (typeof arg === "function") {
    return new RowPermissionFilter(arg);
  } else if (typeof arg === "string") {
    return new ContainsPermissionFilter(arg, allowedValues ?? new Set());
  } else {
    return new PermissionFilterChain(Array.from(arg));
  }
}
