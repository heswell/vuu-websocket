import fs from "node:fs";
import { YAML } from "bun";
import {
  Column,
  ModuleFactory,
  ViewPortDef,
} from "@heswell/vuu-server";
import type { Config } from "@heswell/vuu-server";
import {
  DEFAULT_MODULE_DEFINITIONS,
  moduleDefinitionsToRows,
  modulePermissionsFor,
  type ModuleAccessRole,
} from "@heswell/module-admin";
import {
  modulePermissionsTable,
  modulesTable,
} from "./ModuleDiscoveryTableDefs";
import { ModuleDiscoveryProvider } from "./ModuleDiscoveryProvider";
import { ModuleDiscoveryService } from "./ModuleDiscoveryService";

export type { ModuleAccessRole } from "@heswell/module-admin";

type ModuleAccessConfig = {
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
    return { moduleName, role };
  });
}

export const ModuleDiscoveryModule = (
  moduleAccessRoles: readonly ModuleAccessRole[],
) => {
  const modules = moduleDefinitionsToRows(DEFAULT_MODULE_DEFINITIONS);
  const modulePermissions = modulePermissionsFor(
    DEFAULT_MODULE_DEFINITIONS,
    moduleAccessRoles,
  );

  return ModuleFactory.withNameSpace("MODULE_DISCOVERY")
    .addTable(
      modulesTable,
      (table) => new ModuleDiscoveryProvider(table, modules),
      (table, _provider, _providerContainer, tableContainer) =>
        ViewPortDef(
          table.schema.columns.map<Column>(
            ({ name, serverDataType: dataType }, index) => ({
              name,
              dataType,
              index,
            }),
          ),
          new ModuleDiscoveryService(tableContainer),
        ),
    )
    .addTable(
      modulePermissionsTable,
      (table) => new ModuleDiscoveryProvider(table, modulePermissions),
    )
    .asModule();
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
