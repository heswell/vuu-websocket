import {
  CreateSessionTableRpcHandler,
  ModuleFactory,
  ViewPortDef,
  type DataTable,
} from "@heswell/vuu-server";
import type { Table } from "@heswell/vuu-table";
import { EntitiesProvider, EntityLimitsProvider } from "./EntityLimitsProvider";
import { EntityLimitsSessionService } from "./EntityLimitsSessionService";
import { LimitsProvider } from "./LimitsProvider";
import { LimitsService } from "./LimitsService";
import { LimitsSessionService } from "./LimitsSessionService";
import { LimitsStore } from "./LimitsStore";
import {
  editEntityLimits,
  editLimitDefinitions,
  entities,
  entityLimits,
  exportLimitDefinitions,
  importLimitDefinitions,
  LIMIT_DEFINITIONS,
  limitDefinitions,
} from "./tableDefs";

export interface LimitsModuleOptions {
  /** Defaults to LIMITS */
  namespace?: string;
}

/**
 * Trading limit definitions, edited in session tables created from the
 * edit-, import- and export-limitDefinitions blueprints. Saved changes are
 * Pending until the next business day, when they become Active.
 *
 * Also entities, the tree of entities limits attach to, and entityLimits,
 * a value per metric for each entity that applies to the entities below it,
 * edited in a session table created from the edit-entityLimits blueprint.
 */
export const LimitsModule = ({
  namespace = "LIMITS",
}: LimitsModuleOptions = {}) => {
  let store: LimitsStore | undefined;
  const storeFor = (table: Table | DataTable) =>
    (store ??= new LimitsStore(table as DataTable));

  return ModuleFactory.withNameSpace(namespace)
    .addTable(
      limitDefinitions,
      (table) => new LimitsProvider(table, storeFor(table)),
      (table, _provider, _providerContainer, tableContainer) =>
        ViewPortDef(
          table.tableDef.columns,
          new LimitsService(tableContainer, storeFor(table)),
        ),
    )
    .addSessionTable(
      editLimitDefinitions,
      undefined,
      (table, _provider, _providerContainer, tableContainer) =>
        ViewPortDef(
          table.tableDef.columns,
          new LimitsSessionService(
            tableContainer,
            storeFor(tableContainer.getTable(LIMIT_DEFINITIONS)),
          ),
        ),
    )
    .addSessionTable(
      importLimitDefinitions,
      undefined,
      (table, _provider, _providerContainer, tableContainer) =>
        ViewPortDef(
          table.tableDef.columns,
          new LimitsSessionService(
            tableContainer,
            storeFor(tableContainer.getTable(LIMIT_DEFINITIONS)),
          ),
        ),
    )
    .addSessionTable(exportLimitDefinitions)
    .addTable(entities, (table) => new EntitiesProvider(table))
    .addTable(
      entityLimits,
      (table) => new EntityLimitsProvider(table),
      (table, _provider, _providerContainer, tableContainer) =>
        ViewPortDef(
          table.tableDef.columns,
          new CreateSessionTableRpcHandler(tableContainer),
        ),
    )
    .addSessionTable(
      editEntityLimits,
      undefined,
      (table, _provider, _providerContainer, tableContainer) =>
        ViewPortDef(
          table.tableDef.columns,
          new EntityLimitsSessionService(tableContainer),
        ),
    )
    .asModule();
};
