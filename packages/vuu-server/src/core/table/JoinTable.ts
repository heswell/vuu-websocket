import { Table } from "@heswell/data";
import { JoinTableDef } from "../../api/TableDef";
import { JoinTableProvider } from "../../provider/JoinTableProvider";

export class JoinTable extends Table {
  constructor(
    private tableDef: JoinTableDef,
    private baseTable: Table,
    private joinTable: Table,
    joinProvider: JoinTableProvider
  ) {
    super({ joinProvider, schema: tableDef.schema });
  }

  get name() {
    return this.tableDef.name;
  }

  getTableDef() {
    return this.tableDef;
  }

  get rowCount() {
    return this.baseTable.rowCount;
  }

  insertKey(rowKey: string) {
    const rowIdx = this.baseTable.rowIndexAtKey(rowKey);
    if (rowIdx !== -1) {
      this.emit("rowInserted", rowIdx, this.rowAt(rowIdx));
    }
  }

  publishUpdateForKey(rowKey: string) {
    console.log(`join table publishUpdateForKey ${rowKey}`);
    const rowIdx = this.baseTable.rowIndexAtKey(rowKey);
    if (rowIdx !== -1) {
      this.emit("rowUpdated", rowIdx, this.rowAt(rowIdx));
    }
  }

  get rows() {
    return this.baseTable.rows;
  }

  rowAt(rowIdx: number) {
    const baseRow = this.baseTable.rowAt(rowIdx);
    const key = baseRow[this.baseTable.indexOfKeyField] as string;
    const joinIndex = this.joinTable.rowIndexAtKey(key);

    const joinRow = this.joinTable
      .rowAt(joinIndex)
      ?.toSpliced(this.joinTable.indexOfKeyField, 1);
    return baseRow.concat(joinRow);
  }
}
