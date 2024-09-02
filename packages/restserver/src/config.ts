import { ServerConfig } from "@heswell/server-types";
import { ServiceDefinition } from "./services/RestServiceDefinition";

export const config: ServerConfig = {
  service: ServiceDefinition,
};
