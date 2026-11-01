import {
  Column,
  ModuleFactory,
  ViewPortDef,
} from "@heswell/vuu-server";
import type { Config, TableContainer } from "@heswell/vuu-server";
import {
  managedModuleColumnValues,
  managedModulePermissionValues,
} from "@heswell/module-admin";
import {
  modulePermissionsTable,
  modulesTable,
} from "./ModuleDiscoveryTableDefs";
import { ModuleDiscoveryProvider } from "./ModuleDiscoveryProvider";
import { ModuleDiscoveryService } from "./ModuleDiscoveryService";
import {
  ModuleState,
  YamlModuleStore,
  createModuleState,
  loadDefaultModules,
} from "./ModuleStore";
import { DEFAULT_MODULE_ADMIN_ROLE } from "./ModuleAdminService";

export {
  InMemoryModuleStore,
  ModuleState,
  YamlModuleStore,
  createModuleState,
  loadDefaultModules,
} from "./ModuleStore";

export function loadModuleState(config: Pick<Config, "getPath">) {
  const filePath = config.getPath("vuu.portal.modulesFile", "modules.yaml");
  const defaultsPath = config.getPath(
    "vuu.portal.defaultModulesFile",
    "default-modules.yaml",
  );
  return createModuleState(
    new YamlModuleStore(filePath, () =>
      loadDefaultModules(defaultsPath, Date.now()),
    ),
  );
}

export function loadModuleAdminRole(config: Pick<Config, "getString">) {
  const role = config
    .getString("vuu.portal.moduleAdminRole", DEFAULT_MODULE_ADMIN_ROLE)
    .trim();
  if (!role) {
    throw new Error("vuu.portal.moduleAdminRole must not be empty");
  }
  return role;
}

export const ModuleDiscoveryModule = (
  state: ModuleState,
  { adminRole = DEFAULT_MODULE_ADMIN_ROLE }: { adminRole?: string } = {},
) => {
  const modules = state.modules;
  const moduleRows = modules.map((module) =>
    valuesToRow(modulesTable, managedModuleColumnValues(module)),
  );
  const permissionRows = managedModulePermissionValues(modules).map((values) =>
    valuesToRow(modulePermissionsTable, values),
  );
  let service: ModuleDiscoveryService | undefined;
  const getService = (tableContainer: TableContainer) =>
    service ??= new ModuleDiscoveryService(tableContainer, state, { adminRole });

  return ModuleFactory.withNameSpace("MODULE_DISCOVERY")
    .addTable(
      modulesTable,
      (table) => new ModuleDiscoveryProvider(table, moduleRows),
      (table, _provider, _providerContainer, tableContainer) =>
        ViewPortDef(columnsFor(table), getService(tableContainer)),
    )
    .addTable(
      modulePermissionsTable,
      (table) => new ModuleDiscoveryProvider(table, permissionRows),
      (table, _provider, _providerContainer, tableContainer) =>
        ViewPortDef(columnsFor(table), getService(tableContainer)),
    )
    .asModule();
};

function columnsFor(table: {
  schema: {
    columns: readonly { name: string; serverDataType: Column["dataType"] }[];
  };
}) {
  return table.schema.columns.map<Column>(
    ({ name, serverDataType: dataType }, index) => ({
      name,
      dataType,
      index,
    }),
  );
}

function valuesToRow(
  table: { columns: { name: string }[] },
  values: Record<string, string | number | boolean>,
) {
  return table.columns.map(({ name }) => values[name] ?? "");
}
