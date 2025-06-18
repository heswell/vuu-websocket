import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import logger from "../logger";
import type {
  OrdersServiceBulkDataMessage,
  OrdersServiceBulkDataCompleteMessage,
  OrdersServiceMessage,
} from "./order-service-types";

export class ArrayDataStreamSource
  implements
    UnderlyingDefaultSource<
      OrdersServiceBulkDataMessage | OrdersServiceBulkDataCompleteMessage
    >
{
  index = 0;
  constructor(
    private sessionId: string,
    private data: VuuDataRow[],
    private options: Pick<OrdersServiceBulkDataMessage, "type" | "tableName">,
    private batchSize = 100
  ) {}
  start() {
    logger.info({ sessionId: this.sessionId }, "[ArrayStreamDataSource] start");
  }
  pull(
    controller: ReadableStreamDefaultController<
      OrdersServiceBulkDataMessage | OrdersServiceBulkDataCompleteMessage
    >
  ) {
    const { data, index } = this;
    const count = data.length;

    if (index === count) {
      controller.enqueue({
        tableName: this.options.tableName,
        type: "bulk-insert-complete",
        count,
      });
      controller.close();
    } else {
      const end = Math.min(index + this.batchSize, count);
      const batchSize = end - index;
      const message: OrdersServiceMessage = {
        type: this.options.type,
        tableName: this.options.tableName,
        data: data.slice(index, end),
      };
      logger.info(
        `[ArrayDataStreamSource] enqueue bulk-insert message with ${message.data.length} rows`
      );
      controller.enqueue(message);
      this.index += batchSize;
    }
  }
}
