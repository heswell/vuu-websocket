import type {
  DataTable,
  ModuleRecord,
  ModuleRegistry,
  TableContainer,
  VuuUser,
} from "@heswell/vuu-server";

/**
 * Derives a module's own client identifier from its name, e.g.
 * `userAdmin` -> `vuu-user-admin`. The UI keys each module's saved state by
 * this value, so it must be unique per module.
 */
export function moduleClientIdentifier(name: string) {
  const kebab = name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
  return kebab.startsWith("vuu-") ? kebab : `vuu-${kebab}`;
}

type ModulePermission = {
  moduleId: number;
  role: string;
};

type DiscoveredModuleRecord = ModuleRecord & {
  parentModuleId: number;
};

export function createModuleRegistry(
  tableContainer: TableContainer,
  user: VuuUser,
): ModuleRegistry {
  return {
    modules: selectModules(
      readModules(tableContainer.getTable<DataTable>("modules")),
      readModulePermissions(
        tableContainer.getTable<DataTable>("modulePermissions"),
      ),
      user.authorizations,
    ),
  };
}

function readModules(table: DataTable): DiscoveredModuleRecord[] {
  return table.rows.map((row) => {
    const name = stringValue(table, row, "name");
    const parentModuleId = numberValue(table, row, "parentModuleId");
    return {
      clientIdentifier: moduleClientIdentifier(name),
      id: numberValue(table, row, "id"),
      parentModuleId,
      accessRole: "",
      name,
      title: stringValue(table, row, "title"),
      description: stringValue(table, row, "description"),
      version: numberValue(table, row, "version"),
      enabled: booleanValue(table, row, "enabled"),
      // Nested modules have no navigation entry of their own.
      navLocation:
        parentModuleId === 0 ? stringValue(table, row, "location") : "",
      path: stringValue(table, row, "path"),
      mfComponent: stringValue(table, row, "mfComponent"),
      mfScope: stringValue(table, row, "mfScope"),
      mfUrl: stringValue(table, row, "mfUrl"),
      ...navIcon(table, row),
      ...remoteConnection(table, row),
    };
  });
}

function navIcon(table: DataTable, row: unknown[]) {
  // Optional: rows written before the column existed leave it unset.
  const navIconUrl = row[columnIndex(table, "navIconUrl")];
  return typeof navIconUrl === "string" && navIconUrl
    ? { navIconUrl }
    : {};
}

function remoteConnection(table: DataTable, row: unknown[]) {
  const restUrl = stringValue(table, row, "vuuRestUrl");
  const websocketUrl = stringValue(table, row, "vuuWebsocketUrl");
  const connectionId = stringValue(table, row, "vuuConnectionId");
  return connectionId
    ? {
        vuu: {
          connectionId,
          ...(restUrl ? { restUrl } : {}),
          ...(websocketUrl ? { websocketUrl } : {}),
        },
      }
    : {};
}

function readModulePermissions(table: DataTable): ModulePermission[] {
  return table.rows.map((row) => ({
    moduleId: numberValue(table, row, "module_id"),
    role: stringValue(table, row, "role"),
  }));
}

function selectModules(
  modules: DiscoveredModuleRecord[],
  modulePermissions: ModulePermission[],
  authorizations: string[],
) {
  const moduleRoles = new Map<number, string>();
  const permittedModuleRoles = new Map<number, string>();
  const roles = new Set(authorizations);

  modulePermissions.forEach(({ moduleId, role }) => {
    moduleRoles.set(moduleId, role);
    if (roles.has(role)) {
      permittedModuleRoles.set(moduleId, role);
    }
  });

  const latestByName = new Map<string, DiscoveredModuleRecord>();
  modules.forEach((module) => {
    const accessRole = accessRoleForModule(
      module,
      moduleRoles,
      permittedModuleRoles,
    );
    if (!module.enabled || !accessRole) {
      return;
    }

    const moduleWithAccess = { ...module, accessRole };
    const current = latestByName.get(module.name);
    if (
      !current ||
      module.version > current.version ||
      (module.version === current.version && module.id > current.id)
    ) {
      latestByName.set(module.name, moduleWithAccess);
    }
  });

  // Nested modules are listed alongside their parent (with an empty
  // navLocation), and only when the parent is also available.
  const permittedModules = [...latestByName.values()];
  const permittedIds = new Set(permittedModules.map(({ id }) => id));
  return permittedModules
    .filter(
      ({ parentModuleId }) =>
        parentModuleId === 0 || permittedIds.has(parentModuleId),
    )
    .map(({ parentModuleId: _parentModuleId, ...module }) => module)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function accessRoleForModule(
  module: DiscoveredModuleRecord,
  moduleRoles: Map<number, string>,
  permittedModuleRoles: Map<number, string>,
) {
  const ownRole = permittedModuleRoles.get(module.id);
  if (ownRole) return ownRole;
  if (module.parentModuleId !== 0 && !moduleRoles.has(module.id)) {
    return permittedModuleRoles.get(module.parentModuleId) ?? "";
  }
  return "";
}

function stringValue(table: DataTable, row: unknown[], column: string) {
  const value = row[columnIndex(table, column)];
  if (typeof value !== "string") {
    throw new Error(`Expected ${table.name}.${column} to be a string`);
  }
  return value;
}

function numberValue(table: DataTable, row: unknown[], column: string) {
  const value = row[columnIndex(table, column)];
  if (typeof value !== "number") {
    throw new Error(`Expected ${table.name}.${column} to be a number`);
  }
  return value;
}

function booleanValue(table: DataTable, row: unknown[], column: string) {
  const value = row[columnIndex(table, column)];
  if (typeof value !== "boolean") {
    throw new Error(`Expected ${table.name}.${column} to be a boolean`);
  }
  return value;
}

function columnIndex(table: DataTable, column: string) {
  const index = table.tableDef.columns.findIndex(({ name }) => name === column);
  if (index === -1) {
    throw new Error(`Table ${table.name} does not contain ${column}`);
  }
  return index;
}
