import { DataView, Table } from "@heswell/data";
import logger from "@heswell/data/src/logger.ts";
import type { DataResponse } from "@heswell/data/src/store/rowset/index.ts";
import type { DataTable } from "@heswell/vuu-server/src/core/table/InMemDataTable.ts";
import type { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import { schema } from "../data.ts";
import type { BenchTable, BenchView, EngineAdapter } from "../types.ts";

// the legacy DataView logs on hot paths (setRange); silence it so that we
// measure the algorithms, not the logger
logger.level = "silent";

class BenchDataView extends DataView {
  pendingRows = 0;
  postDataResponse(response: DataResponse | void) {
    if (response) this.pendingRows += response.rows.length;
  }
}

const count = (response: DataResponse | void) =>
  response ? response.rows.length : 0;

class LegacyView implements BenchView {
  constructor(private view: BenchDataView) {}
  getCurrentRange() {
    return count(this.view.getDataForCurrentRange());
  }
  setRange(range: { from: number; to: number }) {
    return count(this.view.setRange(range));
  }
  setConfig(config: Parameters<BenchView["setConfig"]>[0]) {
    let n = 0;
    if (config.groupBy) n += count(this.view.group(config.groupBy));
    if (config.aggregations)
      n += count(this.view.aggregate(config.aggregations));
    if (config.sort) n += count(this.view.sort(config.sort));
    if (config.filterSpec) n += count(this.view.filter(config.filterSpec));
    return n;
  }
  openTreeNode(key: string) {
    return count(this.view.openTreeNode(key));
  }
  flush() {
    const n = this.view.pendingRows;
    this.view.pendingRows = 0;
    return n;
  }
  get size() {
    return this.view.size;
  }
  destroy() {
    const log = console.log;
    console.log = () => undefined;
    this.view.destroy();
    console.log = log;
  }
}

export const legacyAdapter: EngineAdapter = {
  name: "legacy",
  createTable(rows: VuuDataRow[]) {
    const table = new Table({ schema } as any);
    for (const row of rows) table.insert(row.slice() as VuuDataRow);
    return table as unknown as BenchTable;
  },
  createView(table, config, range) {
    const log = console.log;
    console.log = () => undefined;
    try {
      const view = new BenchDataView(
        "bench",
        table as unknown as DataTable,
        {
          columns: config.columns ?? [],
          sort: config.sort ?? { sortDefs: [] },
          filterSpec: config.filterSpec ?? { filter: "" },
          groupBy: config.groupBy ?? [],
          aggregations: config.aggregations ?? [],
          range,
        } as any,
      );
      return new LegacyView(view);
    } finally {
      console.log = log;
    }
  },
};
