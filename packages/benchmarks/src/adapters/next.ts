import { Table } from "@heswell/vuu-table";
import { InMemoryViewport } from "@heswell/vuu-viewport";
import type { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import { schema } from "../data.ts";
import type { BenchTable, BenchView, EngineAdapter } from "../types.ts";

class NextView implements BenchView {
  constructor(private vp: InMemoryViewport) {}
  getCurrentRange() {
    return this.vp.getCurrentRange().rows.length;
  }
  setRange(range: { from: number; to: number }) {
    return this.vp.setRange(range).rows.length;
  }
  setConfig(config: Parameters<BenchView["setConfig"]>[0]) {
    return this.vp.setConfig(config).rows.length;
  }
  openTreeNode(key: string) {
    return this.vp.openTreeNode(key).rows.length;
  }
  flush() {
    return this.vp.flush().rows.length;
  }
  selectAll() {
    return this.vp.selectAll().rows.length;
  }
  get selectedRowCount() {
    return this.vp.selectedRowCount;
  }
  selectedRowKeys() {
    return this.vp.getSelectedRowKeys().length;
  }
  get size() {
    return this.vp.size;
  }
  destroy() {
    this.vp.destroy();
  }
}

export const nextAdapter: EngineAdapter = {
  name: "vuu-viewport",
  createTable(rows: VuuDataRow[]) {
    const table = new Table(schema);
    for (const row of rows) table.insert(row.slice() as VuuDataRow);
    return table as unknown as BenchTable;
  },
  createView(table, config, range) {
    const vp = new InMemoryViewport(table as unknown as Table, {
      id: "bench",
      ...config,
      range,
    });
    return new NextView(vp);
  },
};
