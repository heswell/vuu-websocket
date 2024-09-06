import {
  DataView as View,
  metaData,
  ColumnMetaData,
  Table,
} from "@heswell/data";
import { ISession } from "@heswell/server-types";
import {
  VuuClientMessage,
  VuuViewportCreateRequest,
} from "@vuu-ui/vuu-protocol-types";

export class Subscription {
  public view: View;
  public metaData: ColumnMetaData;

  constructor(
    table: Table,
    viewPortId: string,
    message: VuuClientMessage<VuuViewportCreateRequest>,
    session: ISession
  ) {
    const {
      columns: requestedColumns,
      filterSpec,
      groupBy,
      range,
      sort,
    } = message.body;
    const { name: tablename, columns: availableColumns } = table;
    const columns =
      requestedColumns.length > 0
        ? requestedColumns
        : availableColumns.map((c) => c.name);

    this.view = new View(viewPortId, table, {
      columns,
      filterSpec,
      groupBy,
      range,
      sort,
    });

    this.metaData = metaData(requestedColumns);

    // let timeoutHandle: NodeJS.Timeout;

    // function collectUpdates() {
    //   let { updates, range } = view.updates;
    //   // TODO will we ever get updates for FilterData ? If se we will need correct mats
    //   // depending on the batch type there will be one of
    //   // updates, rows or size. The others will be
    //   // undefined and therefore not survive json serialization.
    //   updates.forEach((batch) => {
    //     const { type, updates, rows, size, offset } = batch;
    //     if (type === 'rowset') {
    //       queue.push(
    //         {
    //           priority: 2,
    //           viewport: viewport,
    //           type,
    //           tablename,
    //           data: {
    //             rows,
    //             size,
    //             offset,
    //             range
    //           }
    //         },
    //         tableMeta
    //       );
    //     } else {
    //       queue.push(
    //         {
    //           priority: 2,
    //           viewport: viewport,
    //           type,
    //           tablename,
    //           updates,
    //           rows,
    //           size,
    //           offset,
    //           range
    //         },
    //         tableMeta
    //       );
    //     }
    //   });

    //   timeoutHandle = setTimeout(collectUpdates, 100);
    // }

    // timeoutHandle = setTimeout(collectUpdates, 1000);
  }

  clear() {
    console.log(`clear subscription`);
    this.view.destroy();
    // @ts-ignore
    this.view = undefined;
  }

  // invoke(method: string, queue: IMessageQueue, ...params) {
  //   let data, filterData;

  //   if (method === "filter") {
  //     [data, ...filterData] = this.view[method](...params);
  //   } else {
  //     data = this.view[method](...params);
  //   }
  //   const meta = tableMeta;

  //   if (data) {
  //     queue.push(
  //       {
  //         priority: 1,
  //         viewport,
  //         type,
  //         data,
  //       },
  //       meta
  //     );
  //   }

  //   filterData &&
  //     filterData.forEach((data) => {
  //       queue.push(
  //         {
  //           priority: 1,
  //           viewport,
  //           type: DataTypes.FILTER_DATA,
  //           data,
  //         },
  //         columnUtils.setFilterColumnMeta
  //       );
  //     });
  // }

  // A client update request is handled with a synchronous call to view.rows
  //   update(options, queue) {
  //     const { range, ...dataOptions } = options;

  //     queue.push({
  //       priority: 1,
  //       viewport: viewport,
  //       type: "rowset",
  //       tablename,
  //       data: {
  //         rows: view.rows(range, options),
  //         size: view.size,
  //         offset: view.offset,
  //       },
  //     });
  //   }

  //   cancel() {
  //     if (timeoutHandle) {
  //       clearTimeout(timeoutHandle);
  //       timeoutHandle = null;
  //     }
  //     view.destroy();
  //     view = null;
  //   }
}
