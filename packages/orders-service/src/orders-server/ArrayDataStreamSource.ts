import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import logger from "../logger";
import type { OrdersServiceMessage, RowCount } from "./order-service-types";

export class ArrayDataStreamSource
  implements UnderlyingDefaultSource<OrdersServiceMessage | RowCount>
{
  index = 0;
  constructor(
    private sessionId: string,
    private data: VuuDataRow[],
    private options: Pick<OrdersServiceMessage, "type" | "tableName">,
    private batchSize = 100
  ) {}
  start() {
    logger.info({ sessionId: this.sessionId }, "[ArrayStreamDataSource] start");
  }
  pull(
    controller: ReadableStreamDefaultController<OrdersServiceMessage | RowCount>
  ) {
    const { data, index } = this;
    const count = data.length;

    if (index === count) {
      controller.enqueue({ count });
      controller.close();
    } else {
      const end = Math.min(index + this.batchSize, count);
      const batchSize = end - index;
      const message: OrdersServiceMessage = {
        data: data.slice(index, end),
        type: this.options.type,
        tableName: this.options.tableName,
      };
      controller.enqueue(message);
      this.index += batchSize;
    }
  }
}
