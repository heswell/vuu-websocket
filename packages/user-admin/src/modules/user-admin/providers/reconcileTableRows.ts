import { Table } from "@heswell/data";
import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

export const reconcileTableRows = (table: Table, nextRows: VuuDataRow[]) => {
  const keyIndex = table.indexOfKeyField;
  const nextKeys = new Set(nextRows.map((row) => String(row[keyIndex])));

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
    table.upsert(row);
  }
};
