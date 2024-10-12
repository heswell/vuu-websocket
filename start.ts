import { start } from "@heswell/server-core";
import restConfig from "@heswell/restserver";
import vuuConfig from "@heswell/vuuserver";

start(vuuConfig, restConfig);
