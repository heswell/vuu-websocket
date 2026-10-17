import { JoinTableProvider } from "../../provider/JoinTableProvider";
import { DataTable, InMemDataTable } from "./InMemDataTable";
import { SessionTableDef } from "../../api/TableDef";
import { VuuDataRow, VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import type { PermissionFilter } from "../filter/PermissionFilter";

export type SessionTableAction = "" | "addRow" | "deleteRow";
export type SessionRowChange = {
  action: SessionTableAction;
  cellUpdates: Record<string, VuuRowDataItemType>;
  key: string;
  lastUpdateTimestamp?: number;
  row: VuuDataRow;
  /**
   * Copy of the source row taken when it was copied into the session (or
   * when a change was undone). Used at save to detect concurrent changes
   * to the source row, whether or not the table has a vuuUpdatedTimestamp.
   */
  sourceSnapshot?: VuuDataRow;
};

type SessionChangeState = Omit<SessionRowChange, "key" | "row">;

export class InMemSessionDataTable extends InMemDataTable {
  #changes = new Map<string, SessionChangeState>();
  #sourceSnapshots = new Map<string, VuuDataRow>();

  creationTimestamp = Date.now();
  #tableId = crypto.randomUUID();
  /**
   * Permission filter of the viewport the session was created from, i.e.
   * the source rows visible to the session owner. Applied to source rows
   * when the session is edited and saved.
   */
  sourcePermissionFilter: PermissionFilter | undefined;
  constructor(
    private sessionId: string,
    tableDef: SessionTableDef,
    joinProvider: JoinTableProvider,
  ) {
    super(tableDef, joinProvider);
  }

  /** Id of the client session that owns this session table. */
  get ownerSessionId() {
    return this.sessionId;
  }

  /** true if the row was added in this session (it has no source row). */
  isAddedRow(key: string) {
    return this.#changes.get(key)?.action === "addRow";
  }

  update(rowIdx: number, row: VuuDataRow, columnName?: string) {
    if (row && columnName) {
      const { columnMap } = this;
      const key = row[columnMap[this.schema.key]] as string;
      const tsIndex = columnMap.vuuUpdatedTimestamp;
      const existingChange = this.#changes.get(key);

      if (existingChange?.action !== "addRow" && columnName !== "vuuAction") {
        const change =
          existingChange ??
          ({
            action: "",
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
    this.#sourceSnapshots.set(row[this.indexOfKeyField] as string, row.slice());
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
    row[this.columnMap.vuuAction] = "addRow";
    this.#changes.set(key, {
      action: "addRow",
      cellUpdates: {},
    });
    super.insert(row);
    return key;
  }

  markRowDeleted(key: string) {
    const row = this.getRowAtKey(key, false);
    if (!row) {
      throw Error(`deleteRow: row ${key} not found`);
    }
    const existingChange = this.#changes.get(key);
    if (existingChange?.action === "addRow") {
      this.#changes.delete(key);
      super.delete(key);
      return;
    }

    const change = existingChange ?? {
      action: "",
      cellUpdates: {},
      lastUpdateTimestamp: row[this.columnMap.vuuUpdatedTimestamp] as
        | number
        | undefined,
    };
    change.action = "deleteRow";
    this.#changes.set(key, change);
    const newRow = row.slice();
    newRow[this.columnMap.vuuAction] = "deleteRow";
    super.update(this.rowIndexAtKey(key), newRow);
  }

  undoRowChange(key: string, sourceTable: DataTable) {
    const row = this.getRowAtKey(key, false);
    if (!row) {
      throw Error(`undoRowChange: row ${key} not found`);
    }

    const change = this.#changes.get(key);
    if (change?.action === "addRow") {
      this.#changes.delete(key);
      super.delete(key);
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
    this.#sourceSnapshots.set(key, sourceRow.slice());
    super.update(this.rowIndexAtKey(key), restoredRow);
  }

  getSessionChanges(): SessionRowChange[] {
    return Array.from(this.#changes, ([key, change]) => ({
      ...change,
      key,
      row: this.getRowAtKey(key),
      sourceSnapshot: this.#sourceSnapshots.get(key),
    }));
  }

  /** The source row as it was when copied into the session, if any. */
  getSourceSnapshot(key: string): VuuDataRow | undefined {
    return this.#sourceSnapshots.get(key);
  }

  get name() {
    return `session:${this.sessionId}/simple-${this.tableDef.name}_${this.creationTimestamp}-${this.#tableId}`;
  }
}

export const isSessionDataTable = (table: object): table is DataTable =>
  table.constructor === InMemSessionDataTable;
