import { Table } from "@heswell/data";

export interface VuuModuleBaseConstructorProps {
  name: string;
  tables: Table[];
}

export class VuuModuleBase {
  #name: string;
  #tables: Table[];

  constructor({ name, tables }: VuuModuleBaseConstructorProps) {
    this.#name = name;
    this.#tables = tables;
  }

  get name() {
    return this.#name;
  }

  get tables() {
    return this.#tables;
  }
}
