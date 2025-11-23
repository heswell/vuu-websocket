import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import logger from "./logger";
import { IDataStore } from "./DataStore";

export interface SnapshotCount {
  type: "snapshot-count";
  count: number;
}

export interface SnapshotBatch {
  isLast: boolean;
  rows: VuuDataRow[];
  type: "snapshot-batch";
}
export interface Upsert {
  resource: string;
  row: VuuDataRow;
  type: "insert" | "update";
}

export type ResourceMessage = SnapshotCount | SnapshotBatch | Upsert;

export class StoreDataStreamSource
  implements UnderlyingDefaultSource<ResourceMessage>
{
  private index = 0;
  private snapshotSent = false;
  constructor(
    private store: IDataStore,
    private columns: string[],
    private loggingContext = "service-utils",
    private batchSize = 100
  ) {}
  start() {
    logger.info(`[${this.loggingContext}:StoreStreamDataSource] start`);
  }
  pull(controller: ReadableStreamDefaultController<ResourceMessage>) {
    const { columns, store, index } = this;

    if (this.snapshotSent) {
    } else if (index === store.count) {
      controller.enqueue({ type: "snapshot-count", count: store.count });
      this.snapshotSent = true;

      store.on("insert", (dataRow) => {
        controller.enqueue({
          resource: "instruments",
          type: "insert",
          row: dataRow,
        } as Upsert);
      });
    } else if (!this.snapshotSent) {
      const end = Math.min(index + this.batchSize, store.count);
      const batchSize = end - index;
      const rows = store.getRows(index, end, columns);
      const message: ResourceMessage = {
        isLast: end === store.count,
        rows,
        type: "snapshot-batch",
      };
      controller.enqueue(message);
      this.index += batchSize;
    }
  }

  cancel?: UnderlyingSourceCancelCallback | undefined;
}
