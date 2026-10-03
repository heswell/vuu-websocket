import { Table } from "@heswell/data";
import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

const SYSTEM_TIMESTAMP_COLUMNS = ["vuuCreatedTimestamp", "vuuUpdatedTimestamp"];

/**
 * Snapshot refreshes stamp every row with the snapshot time. Rows whose data
 * is unchanged keep their existing timestamps so open edit sessions are not
 * reported as stale by a periodic refresh.
 */
export const reconcileTableRows = (table: Table, nextRows: VuuDataRow[]) => {
  const keyIndex = table.indexOfKeyField;
  const nextKeys = new Set(nextRows.map((row) => String(row[keyIndex])));
  const timestampIndices = new Set(
    SYSTEM_TIMESTAMP_COLUMNS.map((name) => table.columnMap?.[name]).filter(
      (index): index is number => index !== undefined,
    ),
  );
  const createdIndex = table.columnMap?.vuuCreatedTimestamp;

  const staleKeys = table.rows
    .map((row) => String(row[keyIndex]))
    .filter((key) => !nextKeys.has(key))
    .sort((left, right) => table.rowIndexAtKey(right) - table.rowIndexAtKey(left));

  for (const key of staleKeys) {
    if (table.rowIndexAtKey(key) !== -1) {
      table.delete(key);
    }
  }

  for (const row of nextRows) {
    const existing = table.rows[table.rowIndexAtKey(String(row[keyIndex]))];
    if (existing) {
      const unchanged = row.every(
        (value, index) => timestampIndices.has(index) || existing[index] === value,
      );
      if (unchanged) continue;
      if (createdIndex !== undefined && existing[createdIndex]) {
        row[createdIndex] = existing[createdIndex];
      }
    }
    table.upsert(row);
  }
};
