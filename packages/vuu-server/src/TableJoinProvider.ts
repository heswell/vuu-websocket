import { JoinTableDef } from "./api/TableDef";
import type { TableDefContainer } from "./core/module/TableDefContainer";

export type TableJoinFactory = (
  tableDefContainer: TableDefContainer
) => JoinTableDef;
