import { Table } from "@heswell/data";
import { JoinTableProvider } from "../../provider/JoinTableProvider";
import { Column, TableDef } from "../../api/TableDef";
import { IProvider, Provider } from "../../provider/Provider";
import { ColumnValueProvider } from "./ColumnValueProvider";
import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

export interface DataTable {
  columnForName: (columnName: string) => Column;
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

  columnForName(columnName: string) {
    const column = this.#tableDef.columns.find(
      (col) => col.name === columnName
    );
    if (column) {
      return column;
    } else {
      throw Error(
        `[DataTable] columnForName ${
          this.#tableDef.name
        } has no column ${columnName}`
      );
    }
  }

  processUpdate(key: string, row: VuuDataRow) {
    // TODO check for update
    this.insert(row);
  }
}

export const isDataTable = (table: object): table is DataTable =>
  table.constructor === InMemDataTable;
