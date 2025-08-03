import { Table } from "@heswell/data";
import { VuuDataRowDto, VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import { type TableContainer } from "../core/table/TableContainer";
import { loadTableFromRemoteResource } from "@heswell/service-utils";

export interface IProvider {
  load: (tableContainer: TableContainer) => Promise<void>;
  loaded: boolean;
  table: Table;
}

export const getRandom = <T = unknown>(list: T[]): T =>
  list[random(0, list.length - 1)];

export function random(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export type BidAsk = { ask: number; bid: number };
export const setRandomBidAsk = (bidAsk: BidAsk) => {
  const mid = random(11, 1499) / 10;
  const spread = random(0.001, 0.005);
  bidAsk.ask = mid + spread / 2;
  bidAsk.bid = mid - spread / 2;
};

export const setRandomBidAskUpdate = (bidAsk: BidAsk) => {
  // const spread = bidAsk.ask - bidAsk.bid;
  const priceChange = (random(1, 4) / 1000) * (random(0, 1) > 0.5 ? 1 : -1);
  // const mid = random(11, 1499) / 10;
  // const spread = random(0.001, 0.005);
  bidAsk.ask = bidAsk.ask + priceChange;
  bidAsk.bid = bidAsk.bid + priceChange;
};

export type BidAskSize = { askSize: number; bidSize: number };
export const setRandomBidAskSize = (bidAsk: BidAskSize) => {
  bidAsk.askSize = random(1000, 100_000);
  bidAsk.bidSize = random(1000, 100_000);
};

export const setRandomBidAskSizeUpdate = (bidAsk: BidAskSize) => {
  bidAsk.askSize = Math.round((bidAsk.askSize * random(1, 15)) / 10);
  bidAsk.bidSize = Math.round((bidAsk.bidSize * random(1, 15)) / 10);
};

export type ProviderFactory = (table: Table) => IProvider;

export const NullProvider: IProvider = {
  load: function (tableContainer: TableContainer): Promise<void> {
    // nothing to see here
    return Promise.resolve(undefined);
  },
  loaded: false,
  table: undefined,
};

export abstract class Provider implements IProvider {
  #loaded = false;
  #table: Table;
  constructor(table: Table) {
    this.#table = table;
  }

  get table() {
    return this.#table;
  }

  get loaded() {
    return this.#loaded;
  }

  // TODO will this ever be set to false ?
  set loaded(loaded: boolean) {
    this.#loaded = loaded;
  }

  abstract load(tableContainer: TableContainer): Promise<void>;

  protected insertRow(row: VuuDataRowDto) {
    const { schema } = this.table;
    const columns = schema.columns.map((col) => col.name);
    const colCount = columns.length;
    const dataRow: VuuRowDataItemType[] = Array(colCount);
    for (let i = 0; i < colCount; i++) {
      dataRow[i] = row[columns[i]];
    }
    this.table.insert(dataRow, false);
  }
}

export abstract class RemoteProvider extends Provider {
  #loadPromise: Promise<void> | undefined;

  async load(_: TableContainer) {
    if (this.#loadPromise === undefined) {
      const { resource, url } = this.remoteServiceDetails();
      const start = performance.now();
      const count = await loadTableFromRemoteResource({
        resource,
        url,
        table: this.table,
      });
      const end = performance.now();
      console.log(
        `[module:SIMUL:RemoteProvider] ${count} ${resource} inserted [${
          end - start
        }ms]`
      );
    } else {
      throw Error("[module:SIMUL:RemoteProvider] load has already been called");
    }
  }
  abstract remoteServiceDetails(): { resource: string; url: string };
}
