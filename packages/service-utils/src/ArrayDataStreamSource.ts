import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import logger from "./logger";

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

export class ArrayDataStreamSource
  implements UnderlyingDefaultSource<ResourceMessage>
{
  index = 0;
  constructor(
    private data: VuuDataRow[],
    private loggingContext = "service-utils",
    private batchSize = 100
  ) {}
  start() {
    logger.info(`[${this.loggingContext}:ArrayStreamDataSource] start`);
  }
  pull(controller: ReadableStreamDefaultController<ResourceMessage>) {
    const { data, index } = this;
    const count = data.length;

    if (index === count) {
      controller.enqueue({ type: "snapshot-count", count });
      controller.close();
      console.log(
        `[${this.loggingContext}:ArrayStreamDataSource] streaming complete`
      );
    } else {
      const end = Math.min(index + this.batchSize, count);
      const batchSize = end - index;
      const message: ResourceMessage = {
        isLast: end === count,
        rows: data.slice(index, end),
        type: "snapshot-batch",
      };
      controller.enqueue(message);
      this.index += batchSize;
    }
  }
}
