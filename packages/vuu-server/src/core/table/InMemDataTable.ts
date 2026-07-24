import { Table } from "@heswell/data";
import { JoinTableProvider } from "../../provider/JoinTableProvider";
import { Column, TableDef } from "../../api/TableDef";
import { IProvider, Provider } from "../../provider/Provider";
import { ColumnValueProvider } from "./ColumnValueProvider";
import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import { ColumnMap } from "@vuu-ui/vuu-utils";
import { InMemSessionDataTable } from "./InMemSessionDataTable";
import { TableSchema } from "@vuu-ui/vuu-data-types";

export interface RowKeyUpdate {
  key: string;
  source: Table | null;
  isDelete?: boolean;
}

export class RowKeyUpdateImpl implements RowKeyUpdate {
  constructor(
    public key: string,
    public source: Table | null,
    public isDelete = false,
  ) {}
}

export const RowKeyUpdate = (
  key: string,
  source: Table | null,
  isDelete?: boolean,
): RowKeyUpdate => new RowKeyUpdateImpl(key, source, isDelete);

export interface DataTable {
  columnForName: (columnName: string) => Column;
  columnMap: ColumnMap;
  columnValueProvider: ColumnValueProvider;
  getRowAtKey(key: string, throwIfMissing?: true): VuuDataRow;
  getRowAtKey(key: string, throwIfMissing: false): VuuDataRow | undefined;
  provider: IProvider | undefined;
  name: string;
  rowIndexAtKey: (key: string) => number;
  rows: VuuDataRow[];
  schema: TableSchema;
  tableDef: TableDef;
  update: (rowIndex: number, row: VuuDataRow, column?: string) => void;
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
      (col) => col.name === columnName,
    );
    if (column) {
      return column;
    } else {
      throw Error(
        `[DataTable] columnForName ${
          this.#tableDef.name
        } has no column ${columnName}`,
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
