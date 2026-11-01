import { ModuleContainer } from "@heswell/vuu-server";
import { ViewportProvider } from "./providers/ViewportProvider";

ModuleContainer.withNameSpace("SYSTEM")
  .addTable(
    {
      columns: [
        { name: "id", dataType: "string" },
        { name: "module", dataType: "string" },
        { name: "tableName", dataType: "string" },
      ],
      keyField: "id",
      name: "viewports",
    },
    (table) => new ViewportProvider(table)
  )
  .asModule();
