import ModuleContainer from "@heswell/vuu-module";
import { InstrumentProvider } from "./providers/InstrumentProvider";

ModuleContainer.withNameSpace("TEST")
  .addTable(
    {
      columns: [
        { name: "Symbol", dataType: "string" },
        { name: "Name", dataType: "string" },
        { name: "Price", dataType: "double" },
        { name: "MarketCap", dataType: "long" },
        { name: "IPO", dataType: "string" },
        { name: "Sector", dataType: "string" },
        { name: "Industry", dataType: "int" },
      ],
      keyField: "Symbol",
      name: "instruments",
    },
    (table) => new InstrumentProvider(table)
  )
  .asModule();
