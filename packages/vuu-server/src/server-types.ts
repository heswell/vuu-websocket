import { VuuColumnDataType } from "@vuu-ui/vuu-protocol-types";
import { TableSchema } from "@vuu-ui/vuu-data-types";
import { JoinTableProvider } from "./provider/JoinTableProvider";

export declare type TableColumnType = {
  name: string;
};

export declare type TableColumn = {
  aggregate?: "avg" | "sum";
  name: string;
  type?: VuuColumnDataType;
};

export interface DataTableDefinition {
  joinProvider?: JoinTableProvider;
  schema: TableSchema;
}
