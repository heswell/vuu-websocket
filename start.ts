import { start } from "@heswell/server-core";
import tableConfig from "@heswell/data-tables";
import restConfig from "@heswell/restserver";
import vuuConfig from "@heswell/vuuserver";

start(tableConfig, vuuConfig, restConfig);
