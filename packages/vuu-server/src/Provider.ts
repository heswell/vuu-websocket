import { Table } from "@heswell/data";
import { Module } from "./Module";
import { VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";

export interface IProvider {
  dependencies: string[];
  load: (module: Module) => Promise<void>;
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

export abstract class Provider implements IProvider {
  #dependencies: string[];
  #loaded = false;
  #table: Table;
  constructor(table: Table, dependencies: string[] = []) {
    this.#dependencies = dependencies;
    this.#table = table;
  }

  get dependencies() {
    return this.#dependencies;
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

  abstract load(module: Module): Promise<void>;

  protected insertRow(row: Record<string, VuuRowDataItemType>) {
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
