import {
  Column,
  ModuleFactory,
  ViewPortDef,
} from "@heswell/vuu-server";
import {
  modulePermissionsTable,
  modulesTable,
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
    "/modules/admin",
    "ModuleAdmin",
    "ModuleAdmin",
    "http://localhost:5008",
    "module",
    "wss://localhost:8092/websocket",
    "https://localhost:8444/api/authn"
  ],
  [
    2,
    "user-admin",
    "Manage users",
    "Add, remove and update users",
    1,
    true,
    "/Users/Manage Users",
    "/users/admin",
    "UserAdmin",
    "UserAdmin",
    "http://localhost:5007",
    "portal",
    "",
    ""
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
    "wss://localhost:8093/websocket",
    "https://localhost:8445/api/authn",
  ],
];

const modulePermissions = [
  [1, 1, "modules.view"],
  [2, 1, "modules.edit"],
  [3, 2, "users.view"],
  [4, 2, "users.admin"],
  [5, 3, "basket.view"],
  [6, 3, "basket.trade"],
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
    .asModule();
