import type {
  VuuColumnDataType,
  VuuDataRow,
  VuuRowDataItemType,
} from "@vuu-ui/vuu-protocol-types";
import type { ColumnMap } from "@vuu-ui/vuu-utils";
import type { RowPredicate } from "@heswell/vuu-viewport";
import { VUU_DEFAULT_COLUMNS } from "../../api/TableDef";
import {
  AllowAllPermissionFilter,
  type PermissionFilter,
} from "../../core/filter/PermissionFilter";

/**
 * Server-maintained columns. They are never editable through editCell,
 * whatever isEditableColumn returns.
 */
export const VUU_SYSTEM_COLUMNS: ReadonlySet<string> = new Set([
  ...VUU_DEFAULT_COLUMNS.map(({ name }) => name),
  "vuuAction",
]);

export const isSystemColumn = (column: string) =>
  VUU_SYSTEM_COLUMNS.has(column);

const isIntegerString = (value: string) => /^\s*[-+]?\d+\s*$/.test(value);

const toNumber = (value: VuuRowDataItemType): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

/**
 * Check a client-supplied value against a column's serverDataType, coercing
 * numeric and boolean strings to their native type. Throws if the value
 * cannot be represented in the column type.
 */
export function coerceCellValue(
  value: unknown,
  dataType: VuuColumnDataType | undefined,
  column = "value",
): VuuRowDataItemType {
  const fail = (): never => {
    throw Error(
      `invalid value for column ${column} (${dataType})`,
    );
  };
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    return fail();
  }
  switch (dataType) {
    case "string":
    case "char":
      return typeof value === "string" ? value : fail();
    case "boolean":
      if (typeof value === "boolean") return value;
      if (value === "true") return true;
      if (value === "false") return false;
      return fail();
    case "int":
    case "long":
    case "epochtimestamp":
    case "epochtimestampnano": {
      if (typeof value === "string" && !isIntegerString(value)) return fail();
      const n = typeof value === "boolean" ? undefined : toNumber(value);
      return n !== undefined && Number.isInteger(n) ? n : fail();
    }
    case "double":
    case "scaleddecimal2":
    case "scaleddecimal4":
    case "scaleddecimal6":
    case "scaleddecimal8": {
      const n = typeof value === "boolean" ? undefined : toNumber(value);
      return n !== undefined ? n : fail();
    }
    default:
      return value;
  }
}

/**
 * Returns a predicate over raw rows of a table with the given columnMap, or
 * undefined if the filter allows every row.
 */
export function permissionPredicate(
  permissionFilter: PermissionFilter | undefined,
  columnMap: ColumnMap,
): RowPredicate | undefined {
  if (
    permissionFilter === undefined ||
    permissionFilter === AllowAllPermissionFilter
  ) {
    return undefined;
  }
  return permissionFilter.createPredicate(columnMap);
}

export const isRowPermitted = (
  predicate: RowPredicate | undefined,
  row: VuuDataRow | undefined,
): row is VuuDataRow => row !== undefined && (!predicate || predicate(row));
