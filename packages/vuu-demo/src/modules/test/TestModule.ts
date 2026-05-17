import { ModuleContainer } from "@heswell/vuu-server/src/core/module/ModuleContainer";
import { InstrumentProvider } from "./providers/InstrumentProvider";
import {
  Link,
  ModuleFactory,
  TableDef,
  VisualLinks,
} from "@heswell/vuu-server";
import { LinkParentProvider } from "./providers/LinkParentProvider";
import { LinkChildProvider } from "./providers/LinkChildProvider";

// ModuleContainer.withNameSpace("TEST")
//   .addTable(
//     {
//       columns: [
//         { name: "Symbol", dataType: "string" },
//         { name: "Name", dataType: "string" },
//         { name: "Price", dataType: "double" },
//         { name: "MarketCap", dataType: "long" },
//         { name: "IPO", dataType: "string" },
//         { name: "Sector", dataType: "string" },
//         { name: "Industry", dataType: "int" },
//       ],
//       keyField: "Symbol",
//       name: "instruments",
//     },
//     (table) => new InstrumentProvider(table)
//   )
//   .asModule();

export const TestModule = () =>
  ModuleFactory.withNameSpace("TEST")
    .addTable(
      TableDef({
        columns: [
          { name: "id", dataType: "string" },
          { name: "data", dataType: "string" },
        ],
        keyField: "id",
        name: "LinkParent",
      }),
      (tableContainer) => new LinkParentProvider(tableContainer)
    )
    .addTable(
      TableDef({
        columns: [
          { name: "id", dataType: "string" },
          { name: "parentId", dataType: "string" },
          { name: "data", dataType: "string" },
        ],
        keyField: "id",
        name: "LinkChild",
        links: VisualLinks(Link("parentId", "LinkParent", "id")),
      }),
      (tableContainer) => new LinkChildProvider(tableContainer)
    )
    .asModule();
