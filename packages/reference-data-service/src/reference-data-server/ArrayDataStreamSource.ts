import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import logger from "../logger";
import type { ReferenceData, RowCount } from "./reference-data-types";

export class ArrayDataStreamSource
  implements UnderlyingDefaultSource<ReferenceData | RowCount>
{
  index = 0;
  constructor(
    private sessionId: string,
    private data: VuuDataRow[],
    private batchSize = 100
  ) {}
  start() {
    logger.info({ sessionId: this.sessionId }, "[ArrayStreamDataSource] start");
  }
  pull(controller: ReadableStreamDefaultController<ReferenceData | RowCount>) {
    const { data, index } = this;
    const count = data.length;

    if (index === count) {
      controller.enqueue({ count });
      controller.close();
    } else {
      const end = Math.min(index + this.batchSize, count);
      const batchSize = end - index;
      const message: ReferenceData = {
        instruments: data.slice(index, end),
      };
      controller.enqueue(message);
      this.index += batchSize;
    }
  }
}
