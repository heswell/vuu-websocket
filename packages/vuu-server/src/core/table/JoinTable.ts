import { Table } from "@heswell/data";
import { JoinTableDef } from "../../api/TableDef";
import { JoinTableProvider } from "../../provider/JoinTableProvider";
import type { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

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
    const { left, right } = this.tableDef.joins.joinSpec;
    const joinValue = baseRow[this.baseTable.columnMap[left]];
    const rightColumnIndex = this.joinTable.columnMap[right];
    const joinIndex =
      rightColumnIndex === this.joinTable.indexOfKeyField
        ? this.joinTable.rowIndexAtKey(String(joinValue))
        : this.joinTable.rows.findIndex(
            (row) => row[rightColumnIndex] === joinValue,
          );
    const joinRow = this.joinTable.rowAt(joinIndex);

    return this.tableDef.joinColumns.map(({ name }) => {
      const baseColumnIndex = this.baseTable.columnMap[name];
      if (baseColumnIndex !== undefined) {
        return baseRow[baseColumnIndex];
      }

      const joinColumnIndex = this.joinTable.columnMap[name];
      return joinRow?.[joinColumnIndex] ?? null;
    }) as VuuDataRow;
  }
}
