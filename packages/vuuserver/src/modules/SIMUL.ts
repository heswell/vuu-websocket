import { VuuModuleBase } from "../services/VuuModuleBase";
import { TableSchema } from "@vuu-ui/vuu-data-types";
import { DataTableAPI } from "@heswell/server-types";

const schemas: Record<string, TableSchema> = {
  instruments: {
    columns: [
      { name: "bbg", serverDataType: "string" },
      { name: "currency", serverDataType: "string" },
      { name: "description", serverDataType: "string" },
      { name: "exchange", serverDataType: "string" },
      { name: "ric", serverDataType: "string" },
      { name: "isin", serverDataType: "string" },
      { name: "lotSize", serverDataType: "int" },
    ],
    key: "ric",
    table: {
      module: "SIMUL",
      table: "instruments",
    },
  },
};

const module = "SIMUL";

export interface VuuModuleConstructorProps {
  dataTableAPI: DataTableAPI;
}

export default class SimulModule extends VuuModuleBase {
  constructor({ dataTableAPI }: VuuModuleConstructorProps) {
    super({
      name: module,
      tables: Object.keys(schemas).map((table) =>
        dataTableAPI.getTable({ module, table })
      ),
    });
  }
}
