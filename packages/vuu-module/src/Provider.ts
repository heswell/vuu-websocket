import { Table } from "@heswell/data";
import { Module } from "./Module";

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
}
