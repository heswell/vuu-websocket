import type { VuuDataRow, VuuRange } from "@vuu-ui/vuu-protocol-types";
import type { ViewportConfig } from "@heswell/vuu-viewport";

/**
 * Minimal surface over which every benchmark scenario is expressed, so the
 * same scenario can be run against each engine implementation.
 */
export interface BenchTable {
  readonly rowCount: number;
  insert(row: VuuDataRow): void;
  upsert(row: VuuDataRow): void;
  delete(key: string): void;
}

export interface BenchView {
  /** Full window, as sent on viewport creation */
  getCurrentRange(): number;
  setRange(range: VuuRange): number;
  setConfig(config: Partial<ViewportConfig>): number;
  openTreeNode(key: string): number;
  /** deliver any queued changes, returns number of rows that would be sent */
  flush(): number;
  /** select every row, returns number of rows that would be sent */
  selectAll(): number;
  readonly selectedRowCount: number;
  /** number of source table keys selected, as resolved for visual links */
  selectedRowKeys(): number;
  readonly size: number;
  destroy(): void;
}

export interface EngineAdapter {
  name: string;
  createTable(rows: VuuDataRow[]): BenchTable;
  createView(
    table: BenchTable,
    config: Partial<ViewportConfig>,
    range: VuuRange,
  ): BenchView;
}
