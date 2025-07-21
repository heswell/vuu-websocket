import { Table } from "@heswell/data";
import { JoinTableDef, TableDef } from "../../api/TableDef";
import { TableContainer } from "../../core/table/TableContainer";
import { type JoinTableProvider } from "../../provider/JoinTableProvider";
import { JoinTable } from "../../core/table/JoinTable";
import { InMemDataTable } from "../../core/table/InMemDataTable";

export const vuuInMemPlugin = {
  joinTableFactory: (
    tableDef: JoinTableDef,
    tableContainer: TableContainer,
    joinProvider: JoinTableProvider
  ) => {
    const baseTable = tableContainer.getTable(tableDef.baseTable.name) as Table;
    const joinTable = tableContainer.getTable(
      tableDef.joins.table.name
    ) as Table;

    const table = new JoinTable(tableDef, baseTable, joinTable, joinProvider);

    tableContainer.addTable(table);
    joinProvider.addJoinTable(table);
  },
  tableFactory: (
    tableDef: TableDef,
    tableContainer: TableContainer,
    joinProvider: JoinTableProvider
  ) => {
    const table = new InMemDataTable(tableDef, joinProvider);
    tableContainer.addTable(table);
    return table;
  },
};
