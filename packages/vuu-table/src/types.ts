import type { TableSchema } from "@vuu-ui/vuu-data-types";
import type {
  VuuDataRow,
  VuuRowDataItemType,
} from "@vuu-ui/vuu-protocol-types";

export type { TableSchema, VuuDataRow, VuuRowDataItemType };

/**
 * Map of column name to index position within a row array.
 */
export type ColumnMap = Record<string, number>;

/**
 * Receives notification of every change to a table. Listeners are invoked
 * synchronously, in registration order. Rows are stored densely, a delete
 * moves the last row into the vacated slot (swap-remove) so listeners that
 * track row indices must handle `movedFromIdx`.
 */
export interface TableListener {
  onInsert?(rowIdx: number, row: VuuDataRow): void;
  /**
   * `previous` is the row that was replaced. It may be the same array
   * instance as `row` if the caller mutated the row in place, in which
   * case it is not possible to determine which columns have changed.
   */
  onUpdate?(rowIdx: number, row: VuuDataRow, previous: VuuDataRow): void;
  /**
   * The row previously at `rowIdx` has been removed. If `movedFromIdx` is
   * not -1, the row previously at `movedFromIdx` (always the last row) has
   * been moved into `rowIdx`.
   */
  onDelete?(rowIdx: number, row: VuuDataRow, movedFromIdx: number): void;
  onClear?(): void;
}

/**
 * Minimal read-only view of a table, sufficient for a viewport engine.
 */
export interface RowSource {
  readonly columnMap: ColumnMap;
  readonly indexOfKeyField: number;
  readonly name: string;
  readonly rowCount: number;
  readonly rows: readonly VuuDataRow[];
  readonly schema: TableSchema;
  /**
   * Monotonic insertion sequence for the row at rowIdx. Used to provide a
   * stable 'natural' (insertion) order independent of physical position.
   */
  seqAt(rowIdx: number): number;
  /** insertion sequence numbers, parallel to rows */
  readonly seq: readonly number[];
  rowIndexAtKey(key: string): number;
  addListener(listener: TableListener): void;
  removeListener(listener: TableListener): void;
}
