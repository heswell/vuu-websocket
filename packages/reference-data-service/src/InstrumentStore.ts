import { Table } from "@heswell/data";
import {
  IDataStore,
  IDequeue,
  MessageQueue,
  ResourceMessage,
} from "@heswell/service-utils";
import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import { instrumentsSchema } from "./tableSchemas";
import logger from "./logger";
import { InstrumentDto } from "./InstrumentDto";
import { ColumnMap } from "@vuu-ui/vuu-utils";

const projectRow = (
  columns: string[],
  columnMap: ColumnMap
): ((rowIn: VuuDataRow) => VuuDataRow) => {
  return (rowIn: VuuDataRow) => {
    const rowOut: VuuDataRow = [];
    for (const col of columns) {
      rowOut.push(rowIn[columnMap[col]]);
    }
    return rowOut;
  };
};

class InstrumentStore implements IDataStore, IDequeue<ResourceMessage> {
  static #instance: InstrumentStore;

  public static get instance(): InstrumentStore {
    if (!InstrumentStore.#instance) {
      InstrumentStore.#instance = new InstrumentStore();
    }
    return InstrumentStore.#instance;
  }

  #instrumentsTable: Table = new Table({ schema: instrumentsSchema });
  #instrumentColumns = instrumentsSchema.columns.map((col) => col.name);

  #queue = new MessageQueue<ResourceMessage>();

  #ready: Promise<void>;

  private constructor() {
    this.#ready = Promise.resolve();
    import("./instrument-factory");
  }

  getSnapshot(resource: string, columns?: string[]) {
    if (resource === "instruments") {
      if (columns) {
        const rowMapper = projectRow(columns, this.#instrumentsTable.columnMap);
        return this.#instrumentsTable.rows.map(rowMapper);
      } else {
        return this.#instrumentsTable.rows;
      }
    } else {
      throw Error(`[RefData:service:InstrumentsStore] no resource ${resource}`);
    }
  }

  get ready() {
    return this.#ready;
  }

  get hasUpdates() {
    if (this.#queue.length > 0) {
      console.log(
        `[RefData:service:InstrumentsStore] hasUpdates ? queue length = ${
          this.#queue.length
        }`
      );
    }
    return this.#queue.length > 0;
  }

  dequeueAllMessages() {
    return this.#queue.dequeueAllMessages();
  }

  addInstrument(instrument: InstrumentDto, publishMessage = false) {
    logger.info(
      `[RefData:service:InstrumentStore] add Instrument  (publish ${publishMessage}),  ric: ${instrument.ric} `
    );
    const columns = this.#instrumentColumns;
    const colCount = columns.length;
    const dataRow: VuuDataRow = Array(colCount);
    // export data in same order that columns are specified in schema
    for (let i = 0; i < colCount; i++) {
      dataRow[i] = instrument[columns[i]];
    }
    this.#instrumentsTable.insert(dataRow);

    if (publishMessage) {
      this.#queue.push({
        type: "insert",
        resource: "instruments",
        row: dataRow,
      });
    }
  }

  updateInstrument(dataRow: VuuDataRow) {
    console.log(`update instrument ${JSON.stringify(dataRow)}`);
    this.#instrumentsTable.upsert(dataRow, true);

    this.#queue.push({
      type: "update",
      resource: "instruments",
      row: dataRow,
    });
  }

  get instrumentsTable() {
    return this.#instrumentsTable;
  }
}

export default InstrumentStore.instance;
