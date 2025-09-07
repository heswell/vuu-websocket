import { JoinTableProvider } from "../../provider/JoinTableProvider";
import { InMemDataTable } from "./InMemDataTable";
import { SessionTableDef } from "../../api/TableDef";

export class InMemSessionDataTable extends InMemDataTable {
  creationTimestamp = Date.now();
  constructor(
    private sessionId: string,
    tableDef: SessionTableDef,
    joinProvider: JoinTableProvider
  ) {
    super(tableDef, joinProvider);
  }

  get name() {
    return `session:${this.sessionId}/simple-${this.tableDef.name}_${this.creationTimestamp}`;
  }
}
