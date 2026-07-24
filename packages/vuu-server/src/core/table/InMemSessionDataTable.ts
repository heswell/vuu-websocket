import { JoinTableProvider } from "../../provider/JoinTableProvider";
import { DataTable, InMemDataTable } from "./InMemDataTable";
import { SessionTableDef } from "../../api/TableDef";
import { VuuDataRow, VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";

type RowUpdates = {
  cellUpdates: Record<string, VuuRowDataItemType>;
  lastUpdateTimestamp?: number;
};

export class InMemSessionDataTable extends InMemDataTable {
  #updates = new Map<string, RowUpdates>();

  creationTimestamp = Date.now();
  constructor(
    private sessionId: string,
    tableDef: SessionTableDef,
    joinProvider: JoinTableProvider,
  ) {
    super(tableDef, joinProvider);
  }

  update(rowIdx: number, row: VuuDataRow, columnName?: string) {
    console.log(`[InMemSessionDataTable] update [${row.join(",")}]`);
    if (row && columnName) {
      const { columnMap } = this;
      const key = row[columnMap[this.schema.key]] as string;
      const tsIndex = columnMap.vuuUpdatedTimestamp;

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
    return super.update(rowIdx, row);
  }

  getSessionUpdates = () => {
    return this.#updates;
  };

  get name() {
    return `session:${this.sessionId}/simple-${this.tableDef.name}_${this.creationTimestamp}`;
  }
}

export const isSessionDataTable = (table: object): table is DataTable =>
  table.constructor === InMemSessionDataTable;
