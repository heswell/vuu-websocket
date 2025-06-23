import { Table } from "@heswell/data";
import { JoinTableDef, TableDef } from "../../api/TableDef";
import { TableContainer } from "../../core/table/TableContainer";
import { type JoinTableProvider } from "../../provider/JoinTableProvider";
import { tableDefToSchema } from "../../tableDefToSchema";
import { JoinTable } from "../../core/table/JoinTable";

export const vuuInMemPlugin = {
  joinTableFactory: (
    moduleName: string, // this isn't in Scala VuuServer
    tableDef: JoinTableDef,
    tableContainer: TableContainer,
    joinProvider: JoinTableProvider
  ) => {
    const baseTable = tableContainer.getTable(tableDef.baseTable.name) as Table;
    const joinTable = tableContainer.getTable(
      tableDef.joins.table.name
    ) as Table;

    console.log(
      `InMemoryPlugin JoinTableFactory create Join table ${moduleName} ${tableDef.name}`
    );

    const table = new JoinTable(tableDef, baseTable, joinTable, joinProvider);

    tableContainer.addTable(table);
    joinProvider.addJoinTable(table);
  },
  tableFactory: (
    moduleName: string, // this isn't in Scala VuuServer
    tableDef: TableDef,
    tableContainer: TableContainer,
    joinProvider: JoinTableProvider
  ) => {
    const table = new Table({
      schema: tableDefToSchema(moduleName, tableDef),
      joinProvider,
    });
    tableContainer.addTable(table);
    return table;
  },
};
