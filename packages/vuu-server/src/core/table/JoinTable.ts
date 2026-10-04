import { JoinTable as MaterializedJoinTable, Table } from "@heswell/vuu-table";
import { Column, JoinTableDef } from "../../api/TableDef";
import { ColumnValueProvider } from "./ColumnValueProvider";
import type { IProvider } from "../../provider/Provider";

/**
 * Server join table. A materialized left outer join, maintained
 * incrementally from change events on the base and right tables, so that
 * viewports over a join table are as cheap as those over a simple table.
 */
export class JoinTable extends MaterializedJoinTable {
  readonly isJoinTable = true;
  readonly columnValueProvider: ColumnValueProvider;
  provider: IProvider | undefined = undefined;

  constructor(
    public readonly tableDef: JoinTableDef,
    baseTable: Table,
    joinTable: Table,
  ) {
    const { left, right } = tableDef.joins.joinSpec;
    super({
      schema: tableDef.schema,
      baseTable,
      joinTable,
      leftColumn: left,
      rightColumn: right,
    });
    this.columnValueProvider = new ColumnValueProvider(this);
  }

  get name() {
    return this.tableDef.name;
  }

  getTableDef() {
    return this.tableDef;
  }

  columnForName(columnName: string): Column {
    const column = this.tableDef.columns.find((c) => c.name === columnName);
    if (column) {
      return column;
    }
    throw Error(
      `[JoinTable] columnForName ${this.tableDef.name} has no column ${columnName}`,
    );
  }
}
