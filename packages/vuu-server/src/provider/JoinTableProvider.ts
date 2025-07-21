import { Table } from "@heswell/data";
import { JoinTable } from "../core/table/JoinTable";
import { JoinTableDef } from "../api/TableDef";
import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

export type JoinEventType = "insert" | "update" | "delete";

class JoinDefToJoinTable {
  constructor(public joinDef: JoinTableDef, public table: JoinTable) {}
}

export class JoinTableProvider {
  constructor() {
    console.log("create JoinTableProvider");
  }

  #joinDefs: JoinDefToJoinTable[] = [];

  hasJoins(tableName: string) {
    return this.#joinDefs.find((defAndTable) =>
      defAndTable.joinDef.containsTable(tableName)
    );
  }

  addJoinTable(joinTable: JoinTable) {
    console.log(`JoinTableProvider addJoinTable ${joinTable.name}`);
    const tableDef = joinTable.getTableDef();
    this.#joinDefs.push(new JoinDefToJoinTable(tableDef, joinTable));

    // Scala
    //     joinSink.addSinkForTable(tableDef.name)
    // sourceTableDefsByName.put(tableDef.baseTable.name, tableDef.baseTable)

    // tableDef.rightTables.foreach(rightTable => {
    //   joinSink.addSinkForTable(rightTable)
    // })

    // tableDef.joins.foreach(joinTo => sourceTableDefsByName.put(joinTo.table.name, joinTo.table))
  }

  sendEvent(
    tableName: string,
    eventType: JoinEventType,
    rowKey: string,
    rowData?: VuuDataRow
  ) {
    this.#joinDefs.forEach(({ joinDef, table }) => {
      if (eventType === "insert") {
        // We don't care about inserts to right join table (as long as we only support left outer jpins)
        if (joinDef.baseTable.name === tableName) {
          table.insertKey(rowKey);
        }
      } else if (eventType === "update") {
        if (
          joinDef.baseTable.name === tableName ||
          joinDef.joins.table.name === tableName
        ) {
          table.publishUpdateForKey(rowKey);
        }
      }
    });
  }
}
