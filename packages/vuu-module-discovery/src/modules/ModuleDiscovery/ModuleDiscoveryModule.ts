import {
  Column,
  ModuleFactory,
  ViewPortDef,
} from "@heswell/vuu-server";
import {
  modulePermissionsTable,
  modulesTable,
  moduleUsersTable,
} from "./ModuleDiscoveryTableDefs";
import { ModuleDiscoveryProvider } from "./ModuleDiscoveryProvider";
import { ModuleDiscoveryService } from "./ModuleDiscoveryService";

const modules = [
  [
    1,
    "module-admin",
    "Manage remote modules",
    "Create new remote module, update existing modules",
    1,
    true,
    "/Modules/Manage Modules",
    "ModuleAdmin",
    "ModuleAdmin",
    "http://localhost:5008",
  ],
  [
    2,
    "user-admin",
    "Manage users",
    "Add, remove and update users",
    1,
    true,
    "/Users/Manage Users",
    "UserAdmin",
    "UserAdmin",
    "http://localhost:5007",
  ],
];

const modulePermissions = [
  [1, 1, "modules.view"],
  [2, 1, "modules.edit"],
  [3, 2, "users.view"],
  [4, 2, "users.admin"],
];

export const ModuleDiscoveryModule = () =>
  ModuleFactory.withNameSpace("MODULE_DISCOVERY")
    .addTable(
      modulesTable,
      (table) => new ModuleDiscoveryProvider(table, modules),
      (table, _provider, _providerContainer, tableContainer) =>
        ViewPortDef(
          table.schema.columns.map<Column>(({ name, serverDataType: dataType }) => ({
            name,
            dataType,
          })),
          new ModuleDiscoveryService(tableContainer),
        ),
    )
    .addTable(
      modulePermissionsTable,
      (table) => new ModuleDiscoveryProvider(table, modulePermissions),
    )
    .addTable(
      moduleUsersTable,
      (table) => new ModuleDiscoveryProvider(table, []),
    )
    .asModule();
