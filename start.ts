import { start } from "@heswell/server-core";
import { DataTableService } from "@heswell/server-types";
import tableConfig from "@heswell/data-tables";
import restConfig from "@heswell/restserver";
import vuuConfig from "@heswell/viewserver";

start(tableConfig, vuuConfig, restConfig);
