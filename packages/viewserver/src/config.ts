import { ServerConfig } from "@heswell/server-types";
import { ServiceDefinition } from "./services/VuuServiceDefinition.js";

export const config: ServerConfig = {
  service: ServiceDefinition,
};
