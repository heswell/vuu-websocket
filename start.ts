import { start } from "@heswell/server-core";
import { config as restConfig } from "@heswell/restserver";
import { config } from "@heswell/viewserver";

start(config, restConfig);
