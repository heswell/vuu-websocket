import { JoinTable } from "../core/table/JoinTable";
import { JoinTableDef } from "../api/TableDef";
import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import { DefaultLifecycleEnabled } from "../toolbox/thread/LifecycleContainer";

export type JoinEventType = "insert" | "update" | "delete";

class JoinDefToJoinTable {
  constructor(
    public joinDef: JoinTableDef,
    public table: JoinTable,
  ) {}
}

/**
 * Registry of join tables. Join tables subscribe directly to change events
 * on their source tables, so no event propagation is required here.
 */
export class JoinTableProvider extends DefaultLifecycleEnabled {
  readonly lifecycleId = "vuuJoinTableProvider";

  #joinDefs: JoinDefToJoinTable[] = [];

  hasJoins(tableName: string) {
    return this.#joinDefs.find((defAndTable) =>
      defAndTable.joinDef.containsTable(tableName),
    );
  }

  addJoinTable(joinTable: JoinTable) {
    this.#joinDefs.push(
      new JoinDefToJoinTable(joinTable.getTableDef(), joinTable),
    );
  }

  /**
   * @deprecated retained for compatibility with the legacy @heswell/data
   * Table. Join tables are maintained by table listeners.
   */
  sendEvent(
    _tableName: string,
    _eventType: JoinEventType,
    _rowKey: string,
    _rowData?: VuuDataRow,
  ) {}
}
