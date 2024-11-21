import { Table } from "@heswell/data";
import { Module } from "./Module";
import { VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";

export interface IProvider {
  dependencies: string[];
  load: (module: Module) => Promise<void>;
  loaded: boolean;
  table: Table;
}

export function random(min: number, max: number) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

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
