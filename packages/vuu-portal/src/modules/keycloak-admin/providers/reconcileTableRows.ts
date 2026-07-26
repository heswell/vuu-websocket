import { Table } from "@heswell/data";
import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

export const reconcileTableRows = (table: Table, nextRows: VuuDataRow[]) => {
  const keyIndex = table.indexOfKeyField;
  const nextKeys = new Set(nextRows.map((row) => row[keyIndex] as string));

  const staleKeys = table.rows
    .map((row) => row[keyIndex] as string)
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
