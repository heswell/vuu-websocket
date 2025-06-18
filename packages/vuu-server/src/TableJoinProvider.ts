import { JoinTableDef } from "./api/TableDef";
import TableDefContainer from "./core/module/TableDefContainer";

export type TableJoinFactory = (
  tableDefContainer: typeof TableDefContainer
) => JoinTableDef;
