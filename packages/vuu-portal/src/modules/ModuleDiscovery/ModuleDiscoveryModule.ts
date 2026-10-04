import fs from "node:fs";
import { YAML } from "bun";
import {
  Column,
  ModuleFactory,
  ViewPortDef,
} from "@heswell/vuu-server";
import type { Config, TableContainer } from "@heswell/vuu-server";
import {
  DEFAULT_MODULE_DEFINITIONS,
  managedModuleColumnValues,
  managedModulePermissionValues,
  toManagedModules,
  type ModuleAccessRole,
} from "@heswell/module-admin";
import {
  modulePermissionsTable,
  modulesTable,
} from "./ModuleDiscoveryTableDefs";
import { ModuleDiscoveryProvider } from "./ModuleDiscoveryProvider";
import { ModuleDiscoveryService } from "./ModuleDiscoveryService";
import { ModuleState, YamlModuleStore, createModuleState } from "./ModuleStore";
import { DEFAULT_MODULE_ADMIN_ROLE } from "./ModuleAdminService";

export type { ModuleAccessRole } from "@heswell/module-admin";
export {
  InMemoryModuleStore,
  ModuleState,
  YamlModuleStore,
  createModuleState,
} from "./ModuleStore";

export type ModuleAccessConfig = {
  moduleAccess?: unknown;
};

export function loadModuleAccessRoles(
  config: Pick<Config, "getPath">,
): ModuleAccessRole[] {
  const filePath = config.getPath(
    "vuu.portal.moduleAccessFile",
    "module-access.yaml",
  );
  const source = fs.readFileSync(filePath, "utf8");
  const parsed = YAML.parse(source) as ModuleAccessConfig;

  if (!isRecord(parsed) || !isRecord(parsed.moduleAccess)) {
    throw new Error(
      `Module access file '${filePath}' must contain a 'moduleAccess' object`,
    );
  }

  return Object.entries(parsed.moduleAccess).map(([moduleName, role]) => {
    if (typeof role !== "string" || role.trim() === "") {
      throw new Error(
        `Module access file '${filePath}' must map '${moduleName}' to a non-empty role`,
      );
    }
    return { moduleName, role: role.trim() };
  });
}

export function loadModuleState(config: Pick<Config, "getPath">) {
  const filePath = config.getPath("vuu.portal.modulesFile", "modules.yaml");
  return createModuleState(
    new YamlModuleStore(filePath, () =>
      toManagedModules(
        DEFAULT_MODULE_DEFINITIONS,
        loadModuleAccessRoles(config),
        Date.now(),
      ),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
