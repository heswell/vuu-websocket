import type { Table } from "@heswell/vuu-table";

/**
 * Distinct column values across a whole table. For values restricted to the
 * rows visible in a viewport, use Viewport.getUniqueValues.
 */
export class ColumnValueProvider {
  constructor(private table: Table) {}

  getUniqueValues(column: string, limit = 10) {
    return this.table.getUniqueValuesForColumn(column).slice(0, limit);
  }

  getUniqueValuesStartingWith(column: string, starts: string, limit = 10) {
    return this.table.getUniqueValuesForColumn(column, starts).slice(0, limit);
  }
}
