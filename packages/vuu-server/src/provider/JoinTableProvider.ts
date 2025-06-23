import { Table } from "@heswell/data";
import { JoinTable } from "../core/table/JoinTable";
import { JoinTableDef } from "../api/TableDef";
import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

class JoinDefToJoinTable {
  constructor(public joinDef: JoinTableDef, public table: JoinTable) {}
}

export class JoinTableProvider {
  static #instance: JoinTableProvider;

  public static get instance(): JoinTableProvider {
    if (!JoinTableProvider.#instance) {
      JoinTableProvider.#instance = new JoinTableProvider();
    }
    return JoinTableProvider.#instance;
  }

  private constructor() {
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
    eventType: "insert" | "update" | "delete",
    rowKey: string,
    rowData: VuuDataRow
  ) {
    this.#joinDefs.forEach(({ joinDef, table }) => {
      if (joinDef.baseTable.name === tableName) {
        if (eventType === "insert") {
          table.insertKey(rowKey);
        }
      }
    });
  }
}

export default JoinTableProvider.instance;
