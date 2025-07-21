import { InstrumentProvider } from "./providers/InstrumentProvider";
import { InstrumentService } from "./services/InstrumentService";
import { Column, ModuleFactory, ViewPortDef } from "@heswell/vuu-server";
import { instruments } from "./SimulTableDefs";
import {
  columnUtils as Columns,
  Join as JoinTo,
  JoinSpec,
  JoinTableDef,
} from "@heswell/vuu-server";

export const SimulationModule = () =>
  ModuleFactory.withNameSpace("SIMUL")
    .addTable(
      instruments,
      (table) => new InstrumentProvider(table),
      (table, provider, providerContainer) =>
        ViewPortDef(
          table.schema.columns.map<Column>(
            ({ name, serverDataType: dataType }) => ({
              name,
              dataType,
            })
          ),
          new InstrumentService(table, providerContainer)
        )
    )
    .addJoinTable((tableDefContainer) =>
      JoinTableDef({
        name: "instrumentPrices",
        baseTable: tableDefContainer.get("SIMUL", "instruments"),
        joinColumns: Columns.allFrom(
          tableDefContainer.get("SIMUL", "instruments")
        ).concat(
          Columns.allFromExcept(
            tableDefContainer.get("PRICES", "prices"),
            "ric"
          )
        ),
        joins: JoinTo(
          tableDefContainer.get("PRICES", "prices"),
          JoinSpec("ric", "ric", "LeftOuterJoin")
        ),
      })
    )
    .asModule();
