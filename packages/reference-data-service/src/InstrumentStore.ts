import { Table } from "@heswell/data";
import { IDataStore, DataStoreEvents } from "@heswell/service-utils";
import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import { instrumentsSchema } from "./tableSchemas";
import { InstrumentDto } from "./InstrumentDto";
import { ColumnMap, EventEmitter } from "@vuu-ui/vuu-utils";

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

class InstrumentStore
  extends EventEmitter<DataStoreEvents>
  implements IDataStore
{
  static #instance: InstrumentStore;

  public static get instance(): InstrumentStore {
    if (!InstrumentStore.#instance) {
      InstrumentStore.#instance = new InstrumentStore();
    }
    return InstrumentStore.#instance;
  }

  #instrumentsTable: Table = new Table({ schema: instrumentsSchema });
  #instrumentColumns = instrumentsSchema.columns.map((col) => col.name);

  #ready: Promise<void>;

  private constructor() {
    super();
    this.#ready = Promise.resolve();
    import("./instrument-factory");
  }
  get count() {
    return this.#instrumentsTable.rowCount;
  }

  getRows(from: number, to: number, columns: string[]): VuuDataRow[] {
    const rows: VuuDataRow[] = [];
    const rowMapper = projectRow(columns, this.#instrumentsTable.columnMap);
    for (let i = from; i < to; i++) {
      rows.push(rowMapper(this.#instrumentsTable.rows[i]));
    }
    return rows;
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

  addInstrument(instrument: InstrumentDto) {
    // logger.info(
    console.log(
      `[RefData:service:InstrumentStore] add Instrument,  ric: ${instrument.ric} `
    );
    const columns = this.#instrumentColumns;
    const colCount = columns.length;
    const dataRow: VuuDataRow = Array(colCount);
    // export data in same order that columns are specified in schema
    for (let i = 0; i < colCount; i++) {
      dataRow[i] = instrument[columns[i]];
    }
    this.#instrumentsTable.insert(dataRow);

    this.emit("insert", dataRow);
  }

  updateInstrument(dataRow: VuuDataRow) {
    console.log(`update instrument ${JSON.stringify(dataRow)}`);
    this.#instrumentsTable.upsert(dataRow, true);
  }

  get instrumentsTable() {
    return this.#instrumentsTable;
  }
}

export default InstrumentStore.instance;
