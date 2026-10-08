import {
  MODULE_ADMIN_RPC,
  executeModuleAdminRpc,
  type ManagedModule,
  type ModuleAdminRpcName,
} from "@heswell/module-admin/contracts";
import type { TableSchema } from "@vuu-ui/vuu-data-types";
import {
  VuuModule,
  type RpcService,
  type ServiceHandler,
} from "../core/module/VuuModule";
import tableContainer from "../core/table/TableContainer";
import { buildDataColumnMapFromSchema, type Table } from "../Table";
import {
  MODULE_ADMIN_MODULE_NAME,
  MODULE_ADMIN_TABLE_SCHEMAS,
  type ModuleAdminTableName,
} from "./module-admin-schemas";
import {
  reconcileModuleAdminTables,
  type ModuleAdminSnapshot,
} from "./snapshot-projection";

type ModuleAdminTables = Record<ModuleAdminTableName, Table>;

const createTable = (tableName: ModuleAdminTableName) => {
  const schema = MODULE_ADMIN_TABLE_SCHEMAS[tableName] satisfies TableSchema;
  return tableContainer.createTable(
    schema,
    [],
    buildDataColumnMapFromSchema(schema),
  );
};

const createTables = (): ModuleAdminTables => ({
  modulePermissions: createTable("modulePermissions"),
  modules: createTable("modules"),
});

const INITIAL_TIMESTAMP = 1_710_000_000_000;

const svgIcon = (body: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`,
  )}`;

const NAV_ICONS = {
  modules: svgIcon(
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  ),
  users: svgIcon(
    '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/><path d="M16 4a4 4 0 0 1 0 8"/><path d="M22 21v-1a6 6 0 0 0-4-5.6"/>',
  ),
  trading: svgIcon('<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-6"/>'),
  tables: svgIcon(
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/>',
  ),
} as const;

const localModule = (
  module: Omit<ManagedModule, "created" | "updated">,
): ManagedModule => ({
  ...module,
  created: INITIAL_TIMESTAMP,
  updated: INITIAL_TIMESTAMP,
});

/**
 * Local seed modules, mirroring the portal's `default-modules.yaml`. The child
 * module `vuu-table-viewer` has no role and inherits its parent's. The
 * disabled `order-blotter` module without an access role is a local-only
 * example.
 */
const INITIAL_MODULES: readonly ManagedModule[] = [
  localModule({
    id: 1,
    version: 1,
    parentModuleId: 0,
    name: "moduleAdmin",
    title: "Manage remote modules",
    description: "Create new remote module, update existing modules",
    enabled: true,
    location: "/Modules/Manage Modules",
    path: "/modules/admin",
    mfComponent: "ModuleAdmin",
    mfScope: "moduleAdmin",
    mfUrl: "http://localhost:5002",
    navIconUrl: NAV_ICONS.modules,
    accessRole: "module-admin-access",
  }),
  localModule({
    id: 2,
    version: 1,
    parentModuleId: 0,
    name: "userAdmin",
    title: "Manage users",
    description: "Add, remove and update users",
    enabled: true,
    location: "/Users/Manage Users",
    path: "/users/admin",
    mfComponent: "UserAdmin",
    mfScope: "userAdmin",
    mfUrl: "http://localhost:5003",
    navIconUrl: NAV_ICONS.users,
    accessRole: "user-admin-access",
  }),
  localModule({
    id: 3,
    version: 1,
    parentModuleId: 0,
    name: "basket-trading",
    title: "Basket trading",
    description: "Basket Trading",
    enabled: true,
    location: "/Trading/Baskets",
    path: "/basket/trade",
    mfComponent: "VuuBasketTradingFeature",
    mfScope: "basketTrading",
    mfUrl: "http://localhost:5006",
    navIconUrl: NAV_ICONS.trading,
    accessRole: "basket-trading-access",
  }),
  localModule({
    id: 4,
    version: 1,
    parentModuleId: 0,
    name: "vuu-table-browser",
    title: "Browse tables",
    description: "Discover and browse VUU tables",
    enabled: true,
    location: "/Tools/Tables",
    path: "/tools/tables",
    mfComponent: "VuuTableBrowser",
    mfScope: "vuuTableBrowser",
    mfUrl: "http://localhost:5004",
    navIconUrl: NAV_ICONS.tables,
    accessRole: "vuu-table-browser-access",
  }),
  localModule({
    id: 5,
    version: 1,
    parentModuleId: 4,
    name: "vuu-table-viewer",
    title: "View table",
    description: "View a selected VUU table",
    enabled: true,
    location: "",
    path: "",
    mfComponent: "VuuTableViewer",
    mfScope: "vuuTableViewer",
    mfUrl: "http://localhost:5005",
    navIconUrl: "",
    accessRole: "",
  }),
  localModule({
    id: 6,
    version: 3,
    parentModuleId: 0,
    name: "order-blotter",
    title: "Order blotter",
    description: "Monitor parent and child orders across all desks.",
    enabled: false,
    location: "/Trading/Orders",
    path: "/trading/orders",
    mfComponent: "OrderBlotter",
    mfScope: "orderBlotter",
    mfUrl: "http://localhost:5009",
    navIconUrl: NAV_ICONS.tables,
    accessRole: "",
  }),
];

export const MODULE_ADMIN_INITIAL_SNAPSHOT: ModuleAdminSnapshot = {
  modules: INITIAL_MODULES,
};

/**
 * In-browser MODULE_DISCOVERY server. Supports the module admin RPCs from
 * `@heswell/module-admin/contracts` on both tables; state is held in memory.
 */
export class ModuleAdminModule extends VuuModule<ModuleAdminTableName> {
  #modules: readonly ManagedModule[];
  #tables: ModuleAdminTables;

  constructor(
    snapshot: ModuleAdminSnapshot = MODULE_ADMIN_INITIAL_SNAPSHOT,
    private readonly now: () => number = Date.now,
  ) {
    super(MODULE_ADMIN_MODULE_NAME);
    this.#modules = snapshot.modules;
    this.#tables = createTables();
    reconcileModuleAdminTables(snapshot, this.#tables);
  }

  /** Current module state. */
  get modules() {
    return this.#modules;
  }

  get menus() {
    return {
      modulePermissions: undefined,
      modules: undefined,
    };
  }

  protected get includeDefaultServices() {
    return false;
  }

  get menuServices() {
    return undefined;
  }

  get schemas(): Record<ModuleAdminTableName, Readonly<TableSchema>> {
    return MODULE_ADMIN_TABLE_SCHEMAS;
  }

  private service =
    (rpcName: ModuleAdminRpcName): ServiceHandler =>
    async (request) => {
      try {
        if (request.type !== "RPC_REQUEST" || request.rpcName !== rpcName) {
          throw new Error(`Expected ${rpcName} RPC request`);
        }
        const { modules, result } = executeModuleAdminRpc(
          this.#modules,
          rpcName,
          request.params,
          this.now,
        );
        this.#modules = modules;
        reconcileModuleAdminTables({ modules }, this.#tables);
        return { data: result, type: "SUCCESS_RESULT" };
      } catch (error) {
        return {
          errorMessage:
            error instanceof Error
              ? error.message
              : "Module admin request failed",
          type: "ERROR_RESULT",
        };
      }
    };

  get services(): Record<ModuleAdminTableName, RpcService[]> {
    const services = (
      Object.keys(MODULE_ADMIN_RPC) as ModuleAdminRpcName[]
    ).map((rpcName) => ({ rpcName, service: this.service(rpcName) }));
    return {
      modulePermissions: services,
      modules: services,
    };
  }

  get tables() {
    return this.#tables;
  }

  get visualLinks() {
    return undefined;
  }
}

export const moduleAdminModule = new ModuleAdminModule();
