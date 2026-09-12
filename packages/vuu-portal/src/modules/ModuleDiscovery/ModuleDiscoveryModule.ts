import fs from "node:fs";
import { YAML } from "bun";
import {
  Column,
  ModuleFactory,
  ViewPortDef,
} from "@heswell/vuu-server";
import type { Config } from "@heswell/vuu-server";
import {
  modulePermissionsTable,
  modulesTable,
} from "./ModuleDiscoveryTableDefs";
import { ModuleDiscoveryProvider } from "./ModuleDiscoveryProvider";
import { ModuleDiscoveryService } from "./ModuleDiscoveryService";

export type ModuleAccessRole = {
  moduleName: string;
  role: string;
};

const modules = [
  [
    1,
    "moduleAdmin",
    "Manage remote modules",
    "Create new remote module, update existing modules",
    1,
    true,
    "/Modules/Manage Modules",
    "/modules/admin",
    "ModuleAdmin",
    "ModuleAdmin",
    "http://localhost:5002",
    "module-admin",
    "wss://localhost:8091/websocket-portal",
    "https://localhost:8443/api/authn/module-admin"
  ],
  [
    2,
    "userAdmin",
    "Manage users",
    "Add, remove and update users",
    1,
    true,
    "/Users/Manage Users",
    "/users/admin",
    "UserAdmin",
    "UserAdmin",
    "http://localhost:5003",
    "user-admin",
    "wss://localhost:8092/websocket-user-admin",
    "https://localhost:8444/api/authn"
  ],
  [
    3,
    "basket-trading",
    "Basket trading",
    "Basket Trading",
    1,
    true,
    "/Trading/Baskets",
    "/basket/trade",
    "VuuBasketTradingFeature",
    "basketTrading",
    "http://localhost:5005",
    "basket",
    "wss://localhost:8093/websocket-basket-trading",
    "https://localhost:8445/api/authn",
  ],
];

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
  const modulePermissions = moduleAccessRoles.map(
    ({ moduleName, role }, index) => {
      const module = modules.find(([, name]) => name === moduleName);
      if (!module) {
        throw new Error(
          `Module access configuration references unknown module '${moduleName}'`,
        );
      }
      return [index + 1, module[0], role];
    },
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
