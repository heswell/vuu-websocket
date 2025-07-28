import { Table } from "@heswell/data";
import { JoinTableProvider } from "../../provider/JoinTableProvider";
import { TableDef } from "../../api/TableDef";
import { IProvider, Provider } from "../../provider/Provider";
import { ColumnValueProvider } from "./ColumnValueProvider";
import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

export interface DataTable {
  columnValueProvider: ColumnValueProvider;
  provider: IProvider | undefined;
  rows: VuuDataRow[];
  tableDef: TableDef;
}

export class InMemDataTable extends Table implements DataTable {
  #columnValueProvider: ColumnValueProvider;
  #provider: IProvider | undefined;
  #tableDef: TableDef;

  constructor(tableDef: TableDef, joinProvider: JoinTableProvider) {
    super({ schema: tableDef.schema, joinProvider });
    this.#tableDef = tableDef;
    this.#columnValueProvider = new ColumnValueProvider(this);
  }

  get columnValueProvider() {
    return this.#columnValueProvider;
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
