import type {
  DataTable,
  ModuleRecord,
  ModuleRegistry,
  NestedModuleRecord,
  TableContainer,
  VuuUser,
} from "@heswell/vuu-server";

const PORTAL_CLIENT_IDENTIFIER = "vuu-portal";

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
      readModulePermissions(tableContainer.getTable<DataTable>("modulePermissions")),
      user.authorizations,
    ),
  };
}

function readModules(table: DataTable): DiscoveredModuleRecord[] {
  return table.rows.map((row) => ({
    clientIdentifier: PORTAL_CLIENT_IDENTIFIER,
    id: numberValue(table, row, "id"),
    parentModuleId: numberValue(table, row, "parentModuleId"),
    loginRole: "",
    name: stringValue(table, row, "name"),
    title: stringValue(table, row, "title"),
    description: stringValue(table, row, "description"),
    version: numberValue(table, row, "version"),
    enabled: booleanValue(table, row, "enabled"),
    location: stringValue(table, row, "location"),
    path: stringValue(table, row, "path"),
    mfComponent: stringValue(table, row, "mfComponent"),
    mfScope: stringValue(table, row, "mfScope"),
    mfUrl: stringValue(table, row, "mfUrl"),
    ...remoteConnection(table, row),
  }));
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
  const permittedModuleRoles = new Map<number, string>();
  const roles = new Set(authorizations);

  modulePermissions.forEach(({ moduleId, role }) => {
    if (roles.has(role)) {
      permittedModuleRoles.set(moduleId, role);
    }
  });

  const latestByName = new Map<string, DiscoveredModuleRecord>();
  modules.forEach((module) => {
    const loginRole = permittedModuleRoles.get(module.id);
    if (!module.enabled || !loginRole) {
      return;
    }

    const moduleWithAccess = { ...module, loginRole };
    const current = latestByName.get(module.name);
    if (
      !current ||
      module.version > current.version ||
      (module.version === current.version && module.id > current.id)
    ) {
      latestByName.set(module.name, moduleWithAccess);
    }
  });

  const permittedModules = [...latestByName.values()];
  return permittedModules
    .filter((module) => module.parentModuleId === 0)
    .map(({ parentModuleId: _parentModuleId, ...module }) => {
      const nestedModules = permittedModules
        .filter((candidate) => candidate.parentModuleId === module.id)
        .map<NestedModuleRecord>(
          ({ name, mfComponent, mfScope, mfUrl }) => ({
            name,
            mfComponent,
            mfScope,
            mfUrl,
          }),
        );
      return {
        ...module,
        ...(nestedModules.length > 0 ? { nestedModules } : {}),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
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
