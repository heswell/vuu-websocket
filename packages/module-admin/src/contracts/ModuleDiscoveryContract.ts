export type ModuleAccessRole = {
  moduleName: string;
  role: string;
};

export type ModuleDefinition = {
  id: number;
  parentModuleId: number;
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
  vuu?: {
    connectionId: string;
    websocketUrl: string;
    restUrl: string;
  };
};

export type ModuleRow = [
  id: number,
  parentModuleId: number,
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
    parentModuleId: 0,
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
    vuu: {
      connectionId: "module-admin",
      websocketUrl: "wss://localhost:8091/websocket-portal",
      restUrl: "https://localhost:8443/api/authn",
    },
  },
  {
    id: 2,
    parentModuleId: 0,
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
    vuu: {
      connectionId: "user-admin",
      websocketUrl: "wss://localhost:8092/websocket-user-admin",
      restUrl: "https://localhost:8444/api/authn",
    },
  },
  {
    id: 3,
    parentModuleId: 0,
    name: "basket-trading",
    title: "Basket trading",
    description: "Basket Trading",
    version: 1,
    enabled: true,
    location: "/Trading/Baskets",
    path: "/basket/trade",
    mfComponent: "VuuBasketTradingFeature",
    mfScope: "basketTrading",
    mfUrl: "http://localhost:5006",
    vuu: {
      connectionId: "basket",
      websocketUrl: "wss://localhost:8093/websocket-basket-trading",
      restUrl: "https://localhost:8445/api/authn",
    },
  },
  {
    id: 4,
    parentModuleId: 0,
    name: "vuu-table-browser",
    title: "Browse tables",
    description: "Discover and browse VUU tables",
    version: 1,
    enabled: true,
    location: "/Tools/Tables",
    path: "/tools/tables",
    mfComponent: "VuuTableBrowser",
    mfScope: "vuuTableBrowser",
    mfUrl: "http://localhost:5004",
  },
  {
    id: 5,
    parentModuleId: 4,
    name: "vuu-table-viewer",
    title: "View table",
    description: "View a selected VUU table",
    version: 1,
    enabled: true,
    location: "",
    path: "",
    mfComponent: "VuuTableViewer",
    mfScope: "vuuTableViewer",
    mfUrl: "http://localhost:5005",
  },
] as const satisfies readonly ModuleDefinition[];

export const moduleDefinitionsToRows = (
  modules: readonly ModuleDefinition[],
): ModuleRow[] =>
  modules.map((module) => [
    module.id,
    module.parentModuleId,
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
    module.vuu?.connectionId ?? "",
    module.vuu?.websocketUrl ?? "",
    module.vuu?.restUrl ?? "",
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
