import { ServerConfig } from "@heswell/server-types";
import { instruments } from "@heswell/viewserver";
import { ServiceDefinition } from "./services/RestServiceDefinition";

export const config: ServerConfig = {
  services: [ServiceDefinition],
  DataTables: [instruments],
};
