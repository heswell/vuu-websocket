import { JoinTableProvider } from "../../provider/JoinTableProvider";
import { DataTable, InMemDataTable } from "./InMemDataTable";
import { SessionTableDef } from "../../api/TableDef";
import { VuuDataRow, VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";

type RowUpdates = {
  cellUpdates: Record<string, VuuRowDataItemType>;
  lastUpdateTimestamp?: number;
};

export type SessionTableAction = "" | "addRow" | "deleteRow";

export class InMemSessionDataTable extends InMemDataTable {
  #updates = new Map<string, RowUpdates>();
  #insertedKeys = new Set<string>();

  creationTimestamp = Date.now();
  #tableId = crypto.randomUUID();
  constructor(
    private sessionId: string,
    tableDef: SessionTableDef,
    joinProvider: JoinTableProvider,
  ) {
    super(tableDef, joinProvider);
  }

  update(rowIdx: number, row: VuuDataRow, columnName?: string) {
    if (row && columnName) {
      const { columnMap } = this;
      const key = row[columnMap[this.schema.key]] as string;
      const tsIndex = columnMap.vuuUpdatedTimestamp;

      if (!this.#insertedKeys.has(key) && columnName !== "vuu_action") {
        let updatesForRow = this.#updates.get(key);
        if (updatesForRow === undefined) {
          updatesForRow = {
            lastUpdateTimestamp: row[tsIndex] as number | undefined,
            cellUpdates: {},
          };
          this.#updates.set(key, updatesForRow);
        }
        updatesForRow.cellUpdates[columnName] = row[columnMap[columnName]];
      }
    }
    return super.update(rowIdx, row);
  }

  insertSourceRow(row: VuuDataRow) {
    const sessionRow = new Array(this.schema.columns.length).fill("");
    row.forEach((value, index) => {
      sessionRow[index] = value;
    });
    super.insert(sessionRow, false);
  }

  addSessionRow(
    data: Record<string, VuuRowDataItemType>,
    suppliedKey?: string,
  ) {
    const key = suppliedKey ?? crypto.randomUUID();
    if (this.getRowAtKey(key, false)) {
      throw Error(`addRow: row ${key} already exists`);
    }

    const row = new Array(this.schema.columns.length).fill("");
    for (const [column, value] of Object.entries(data)) {
      const columnIndex = this.columnMap[column];
      if (columnIndex === undefined) {
        throw Error(`addRow: column ${column} not found`);
      }
      row[columnIndex] = value;
    }
    row[this.indexOfKeyField] = key;
    row[this.columnMap.vuu_action] = "addRow";
    this.#insertedKeys.add(key);
    super.insert(row);
    return key;
  }

  markRowDeleted(key: string) {
    const row = this.getRowAtKey(key, false);
    if (!row) {
      throw Error(`deleteRow: row ${key} not found`);
    }
    if (!this.#insertedKeys.has(key) && !this.#updates.has(key)) {
      this.#updates.set(key, {
        lastUpdateTimestamp: row[this.columnMap.vuuUpdatedTimestamp] as
          | number
          | undefined,
        cellUpdates: {},
      });
    }
    const newRow = row.slice();
    newRow[this.columnMap.vuu_action] = "deleteRow";
    super.update(this.rowIndexAtKey(key), newRow);
  }

  undoRowChange(key: string, sourceTable: DataTable) {
    const row = this.getRowAtKey(key, false);
    if (!row) {
      throw Error(`undoRowChange: row ${key} not found`);
    }

    if (this.#insertedKeys.has(key)) {
      if (row[this.columnMap.vuu_action] === "deleteRow") {
        const newRow = row.slice();
        newRow[this.columnMap.vuu_action] = "addRow";
        super.update(this.rowIndexAtKey(key), newRow);
      } else {
        this.#insertedKeys.delete(key);
        this.#updates.delete(key);
        super.delete(key);
      }
      return;
    }

    const sourceRow = sourceTable.getRowAtKey(key, false);
    if (!sourceRow) {
      throw Error(`undoRowChange: source row ${key} not found`);
    }
    const restoredRow = new Array(this.schema.columns.length).fill("");
    sourceRow.forEach((value, index) => {
      restoredRow[index] = value;
    });
    this.#updates.delete(key);
    super.update(this.rowIndexAtKey(key), restoredRow);
  }

  getAction(row: VuuDataRow): SessionTableAction {
    return (row[this.columnMap.vuu_action] ?? "") as SessionTableAction;
  }

  getSessionUpdates = () => {
    return this.#updates;
  };

  get name() {
    return `session:${this.sessionId}/simple-${this.tableDef.name}_${this.creationTimestamp}-${this.#tableId}`;
  }
}

export const isSessionDataTable = (table: object): table is DataTable =>
  table.constructor === InMemSessionDataTable;
