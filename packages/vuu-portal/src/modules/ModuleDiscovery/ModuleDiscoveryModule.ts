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

const modulePermissions = [
  [1, 1, "module-admin-access"],
  [2, 2, "user-admin-access"],
  [3, 3, "basket-trading-access"],
];

export const ModuleDiscoveryModule = () =>
  ModuleFactory.withNameSpace("MODULE_DISCOVERY")
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
