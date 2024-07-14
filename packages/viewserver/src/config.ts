import { ServerConfig } from "@heswell/server-types";
import {
  instruments,
  // InstrumentPrices,
  // OrderBlotter /*, OrderBook, Simpsons,, TestTable */
} from "../dataTables/index.ts";
import { ServiceDefinition as DataTableService } from "./services/DataTableServiceDefinition.js";

export const config: ServerConfig = {
  services: [DataTableService],
  DataTables: [instruments],
};
