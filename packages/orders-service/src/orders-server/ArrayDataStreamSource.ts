import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import logger from "../logger";
import type { OrdersData, RowCount } from "./order-service-types";

export class ArrayDataStreamSource
  implements UnderlyingDefaultSource<OrdersData | RowCount>
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
  pull(controller: ReadableStreamDefaultController<OrdersData | RowCount>) {
    const { data, index } = this;
    const count = data.length;

    if (index === count) {
      controller.enqueue({ count });
      controller.close();
    } else {
      const end = Math.min(index + this.batchSize, count);
      const batchSize = end - index;
      const message: OrdersData = {
        parentOrders: data.slice(index, end),
      };
      controller.enqueue(message);
      this.index += batchSize;
    }
  }
}
