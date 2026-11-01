import { TableDef } from "@heswell/vuu-server";
import type { VuuColumnDataType } from "@vuu-ui/vuu-protocol-types";
import { equitiesSchema } from "@heswell/equity-refdata-service/schema";

/**
 * The equities table mirrors the schema published by the equity refdata
 * service, so the service owns the column contract.
 */
export const equities = TableDef({
  columns: equitiesSchema.columns.map(({ name, serverDataType }) => ({
    name,
    dataType: serverDataType as VuuColumnDataType,
  })),
  joinFields: "ric",
  keyField: equitiesSchema.key,
  name: equitiesSchema.table.table,
});
