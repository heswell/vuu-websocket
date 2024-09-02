import { ServerConfig } from "@heswell/server-types";
import { instruments } from "../dataTables/index.ts";
import { ServiceDefinition as DataTableService } from "./services/DatatableServiceDefinition";

export const config: ServerConfig = {
  service: DataTableService,
  DataTables: [instruments],
};
