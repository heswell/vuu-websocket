import { JoinTableProvider } from "../../provider/JoinTableProvider";
import { DataTable, InMemDataTable } from "./InMemDataTable";
import { SessionTableDef } from "../../api/TableDef";
import { VuuDataRow, VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";

export type SessionTableAction = "" | "addRow" | "deleteRow";
export type SessionRowChange = {
  action: SessionTableAction;
  cellUpdates: Record<string, VuuRowDataItemType>;
  isInserted: boolean;
  key: string;
  lastUpdateTimestamp?: number;
  row: VuuDataRow;
};

type SessionChangeState = Omit<SessionRowChange, "key" | "row">;

export class InMemSessionDataTable extends InMemDataTable {
  #changes = new Map<string, SessionChangeState>();

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
      const existingChange = this.#changes.get(key);

      if (!existingChange?.isInserted && columnName !== "vuu_action") {
        const change =
          existingChange ??
          ({
            action: "",
            isInserted: false,
            lastUpdateTimestamp: row[tsIndex] as number | undefined,
            cellUpdates: {},
          } satisfies SessionChangeState);
        change.cellUpdates[columnName] = row[columnMap[columnName]];
        this.#changes.set(key, change);
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
    this.#changes.set(key, {
      action: "addRow",
      cellUpdates: {},
      isInserted: true,
    });
    super.insert(row);
    return key;
  }

  markRowDeleted(key: string) {
    const row = this.getRowAtKey(key, false);
    if (!row) {
      throw Error(`deleteRow: row ${key} not found`);
    }
    const change = this.#changes.get(key) ?? {
      action: "",
      cellUpdates: {},
      isInserted: false,
      lastUpdateTimestamp: row[this.columnMap.vuuUpdatedTimestamp] as
        | number
        | undefined,
    };
    change.action = "deleteRow";
    this.#changes.set(key, change);
    const newRow = row.slice();
    newRow[this.columnMap.vuu_action] = "deleteRow";
    super.update(this.rowIndexAtKey(key), newRow);
  }

  undoRowChange(key: string, sourceTable: DataTable) {
    const row = this.getRowAtKey(key, false);
    if (!row) {
      throw Error(`undoRowChange: row ${key} not found`);
    }

    const change = this.#changes.get(key);
    if (change?.isInserted) {
      if (row[this.columnMap.vuu_action] === "deleteRow") {
        const newRow = row.slice();
        newRow[this.columnMap.vuu_action] = "addRow";
        change.action = "addRow";
        super.update(this.rowIndexAtKey(key), newRow);
      } else {
        this.#changes.delete(key);
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
    this.#changes.delete(key);
    super.update(this.rowIndexAtKey(key), restoredRow);
  }

  getSessionChanges(): SessionRowChange[] {
    return Array.from(this.#changes, ([key, change]) => ({
      ...change,
      key,
      row: this.getRowAtKey(key),
    }));
  }

  get name() {
    return `session:${this.sessionId}/simple-${this.tableDef.name}_${this.creationTimestamp}-${this.#tableId}`;
  }
}

export const isSessionDataTable = (table: object): table is DataTable =>
  table.constructor === InMemSessionDataTable;
