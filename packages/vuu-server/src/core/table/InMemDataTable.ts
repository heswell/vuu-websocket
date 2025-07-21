import { Table } from "@heswell/data";
import { JoinTableProvider } from "../../provider/JoinTableProvider";
import { TableDef } from "../../api/TableDef";
import { IProvider, Provider } from "../../provider/Provider";

export interface DataTable {
  provider: IProvider | undefined;
  tableDef: TableDef;
}

export class InMemDataTable extends Table implements DataTable {
  #provider: IProvider | undefined;
  #tableDef: TableDef;

  constructor(tableDef: TableDef, joinProvider: JoinTableProvider) {
    super({ schema: tableDef.schema, joinProvider });
    this.#tableDef = tableDef;
  }

  get provider() {
    return this.#provider;
  }
  set provider(provider: IProvider | undefined) {
    this.#provider = provider;
  }
  get tableDef() {
    return this.#tableDef;
  }
  set tableDef(tableDef: TableDef) {
    this.#tableDef = tableDef;
  }
}

export const isDataTable = (table: object): table is DataTable =>
  table.constructor === InMemDataTable;
