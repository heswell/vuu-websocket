export type ModuleAccessRole = {
  moduleName: string;
  role: string;
};

export type ModuleDefinition = {
  id: number;
  name: string;
  title: string;
  description: string;
  version: number;
  enabled: boolean;
  location: string;
  path: string;
  mfComponent: string;
  mfScope: string;
  mfUrl: string;
  vuuConnectionId: string;
  vuuWebsocketUrl: string;
  vuuRestUrl: string;
};

export type ModuleRow = [
  id: number,
  name: string,
  title: string,
  description: string,
  version: number,
  enabled: boolean,
  location: string,
  path: string,
  mfComponent: string,
  mfScope: string,
  mfUrl: string,
  vuuConnectionId: string,
  vuuWebsocketUrl: string,
  vuuRestUrl: string,
];

export type ModulePermissionRow = [
  id: number,
  moduleId: number,
  role: string,
];

export const DEFAULT_MODULE_DEFINITIONS = [
  {
    id: 1,
    name: "moduleAdmin",
    title: "Manage remote modules",
    description: "Create new remote module, update existing modules",
    version: 1,
    enabled: true,
    location: "/Modules/Manage Modules",
    path: "/modules/admin",
    mfComponent: "ModuleAdmin",
    mfScope: "ModuleAdmin",
    mfUrl: "http://localhost:5002",
    vuuConnectionId: "module-admin",
    vuuWebsocketUrl: "wss://localhost:8091/websocket-portal",
    vuuRestUrl: "https://localhost:8443/api/authn",
  },
  {
    id: 2,
    name: "userAdmin",
    title: "Manage users",
    description: "Add, remove and update users",
    version: 1,
    enabled: true,
    location: "/Users/Manage Users",
    path: "/users/admin",
    mfComponent: "UserAdmin",
    mfScope: "UserAdmin",
    mfUrl: "http://localhost:5003",
    vuuConnectionId: "user-admin",
    vuuWebsocketUrl: "wss://localhost:8092/websocket-user-admin",
    vuuRestUrl: "https://localhost:8444/api/authn",
  },
  {
    id: 3,
    name: "basket-trading",
    title: "Basket trading",
    description: "Basket Trading",
    version: 1,
    enabled: true,
    location: "/Trading/Baskets",
    path: "/basket/trade",
    mfComponent: "VuuBasketTradingFeature",
    mfScope: "basketTrading",
    mfUrl: "http://localhost:5005",
    vuuConnectionId: "basket",
    vuuWebsocketUrl: "wss://localhost:8093/websocket-basket-trading",
    vuuRestUrl: "https://localhost:8445/api/authn",
  },
] as const satisfies readonly ModuleDefinition[];

export const moduleDefinitionsToRows = (
  modules: readonly ModuleDefinition[],
): ModuleRow[] =>
  modules.map((module) => [
    module.id,
    module.name,
    module.title,
    module.description,
    module.version,
    module.enabled,
    module.location,
    module.path,
    module.mfComponent,
    module.mfScope,
    module.mfUrl,
    module.vuuConnectionId,
    module.vuuWebsocketUrl,
    module.vuuRestUrl,
  ]);

export const modulePermissionsFor = (
  modules: readonly ModuleDefinition[],
  moduleAccessRoles: readonly ModuleAccessRole[],
): ModulePermissionRow[] =>
  moduleAccessRoles.map(({ moduleName, role }, index) => {
    const module = modules.find(({ name }) => name === moduleName);
    if (!module) {
      throw new Error(
        `Module access configuration references unknown module '${moduleName}'`,
      );
    }
    return [index + 1, module.id, role];
  });
