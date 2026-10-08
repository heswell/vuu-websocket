/**
 * Compatibility exports for published consumers (e.g. @vuu-ui/vuu-data-test)
 * that still import the retired in-code module catalog.
 *
 * @deprecated Module seed data now lives in vuu-portal's default-modules.yaml.
 * Remove once those consumers no longer import these symbols.
 */
import type { ManagedModule } from "./ModuleAdminContract";

/** @deprecated */
export type ModuleAccessRole = {
  moduleName: string;
  role: string;
};

/** @deprecated */
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
  navIconUrl?: string;
};

const svgIcon = (body: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`,
  )}`;

/** @deprecated */
export const MODULE_NAV_ICONS = {
  modules: svgIcon(
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  ),
  users: svgIcon(
    '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/><path d="M16 4a4 4 0 0 1 0 8"/><path d="M22 21v-1a6 6 0 0 0-4-5.6"/>',
  ),
  trading: svgIcon(
    '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-6"/>',
  ),
  tables: svgIcon(
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/>',
  ),
} as const;

/** @deprecated */
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
    mfScope: "moduleAdmin",
    mfUrl: "http://localhost:5002",
    navIconUrl: MODULE_NAV_ICONS.modules,
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
    mfScope: "userAdmin",
    mfUrl: "http://localhost:5003",
    navIconUrl: MODULE_NAV_ICONS.users,
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
    navIconUrl: MODULE_NAV_ICONS.trading,
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
    navIconUrl: MODULE_NAV_ICONS.tables,
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

/** @deprecated */
export const toManagedModules = (
  definitions: readonly ModuleDefinition[],
  accessRoles: readonly ModuleAccessRole[],
  timestamp: number,
): ManagedModule[] => {
  for (const { moduleName } of accessRoles) {
    if (!definitions.some(({ name }) => name === moduleName)) {
      throw new Error(
        `Module access configuration references unknown module '${moduleName}'`,
      );
    }
  }
  const rolesByName = new Map(
    accessRoles.map(({ moduleName, role }) => [moduleName, role.trim()]),
  );
  return definitions.map((definition) => ({
    parentModuleId: definition.parentModuleId,
    name: definition.name,
    title: definition.title,
    description: definition.description,
    enabled: definition.enabled,
    location: definition.location,
    path: definition.path,
    mfComponent: definition.mfComponent,
    mfScope: definition.mfScope,
    mfUrl: definition.mfUrl,
    navIconUrl: definition.navIconUrl ?? "",
    accessRole: rolesByName.get(definition.name) ?? "",
    id: definition.id,
    version: definition.version,
    created: timestamp,
    updated: timestamp,
  }));
};
