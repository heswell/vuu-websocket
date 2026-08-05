import {
  authenticateBearerRequest,
  AuthenticationError as SharedAuthenticationError,
  AuthenticationUnavailableError,
  BearerTokenAuthProvider,
  createCorsHeaders,
  DataTable,
  HttpHandlerOptions,
  HttpRequestHandler,
  TableContainer,
} from "@heswell/vuu-server";

const MODULE_REGISTRY_PATH = "/module-registry";
interface RemoteModuleConnection {
  connectionId: string;
  restUrl?: string;
  websocketUrl?: string;
}


type ModuleRecord = {
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
  vuu: RemoteModuleConnection;
};

type ModulePermission = {
  moduleId: number;
  role: string;
};

type ModuleUser = {
  moduleId: number;
  username: string;
};

export function createModuleRegistryHttpHandler(
  authProvider: BearerTokenAuthProvider,
  getTableContainer: () => TableContainer,
  { allowedOrigin = "*" }: HttpHandlerOptions = {},
): HttpRequestHandler {
  return async (req, url) => {
    if (url.pathname !== MODULE_REGISTRY_PATH) {
      return undefined;
    }

    const corsHeaders = createCorsHeaders(req, allowedOrigin);

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders,
          "Access-Control-Allow-Headers":
            "Authorization, Content-Type",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
      });
    }

    if (req.method !== "GET") {
      return new Response(
        JSON.stringify({
          error: "Method not allowed",
          path: MODULE_REGISTRY_PATH,
        }),
        {
          status: 405,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    try {
      const user = await authenticateBearerRequest(authProvider, req);
      const tableContainer = getTableContainer();
      const modules = readModules(tableContainer.getTable<DataTable>("modules"));
      const modulePermissions = readModulePermissions(
        tableContainer.getTable<DataTable>("modulePermissions"),
      );
      const moduleUsers = readModuleUsers(
        tableContainer.getTable<DataTable>("moduleUsers"),
      );

      return jsonResponse({
        modules: selectModules(
          modules,
          modulePermissions,
          moduleUsers,
          user.name,
          user.authorizations,
        ),
      }, 200, corsHeaders);
    } catch (error) {
      if (error instanceof SharedAuthenticationError) {
        console.warn(
          `[ModuleRegistry] Authentication failed: ${error.message}`,
        );
        const unavailable = error instanceof AuthenticationUnavailableError;
        return jsonResponse(
          {
            error: unavailable
              ? "Authentication service unavailable"
              : "Authentication failed",
          },
          unavailable ? 503 : 401,
          corsHeaders,
        );
      }

      console.error(
        `[ModuleRegistry] Failed to resolve modules: ${(error as Error).message}`,
      );
      return jsonResponse({ error: "Unable to resolve modules" }, 500, corsHeaders);
    }
  };
}

function readModules(table: DataTable): ModuleRecord[] {
  return table.rows.map((row) => ({
    id: numberValue(table, row, "id"),
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
    vuu: {
      connectionId: stringValue(table, row, "vuuConnectionId"),
      restUrl: stringValue(table, row, "vuuRestUrl") || undefined,
      websocketUrl: stringValue(table, row, "vuuWebsocketUrl") || undefined,
    }
  }));
}

function readModulePermissions(table: DataTable): ModulePermission[] {
  return table.rows.map((row) => ({
    moduleId: numberValue(table, row, "module_id"),
    role: stringValue(table, row, "role"),
  }));
}

function readModuleUsers(table: DataTable): ModuleUser[] {
  return table.rows.map((row) => ({
    moduleId: numberValue(table, row, "module_id"),
    username: stringValue(table, row, "username"),
  }));
}

function selectModules(
  modules: ModuleRecord[],
  modulePermissions: ModulePermission[],
  moduleUsers: ModuleUser[],
  username: string,
  authorizations: string[],
) {


  console.log(`selectModules
      authorizations: ${authorizations.join(",")}
    `)
  console.table(modulePermissions);
  console.table(moduleUsers)
  console.table(modules)


  const permittedModuleIds = new Set<number>();
  const roles = new Set(authorizations);

  modulePermissions.forEach(({ moduleId, role }) => {
    if (roles.has(role)) {
      permittedModuleIds.add(moduleId);
    }
  });
  moduleUsers.forEach(({ moduleId, username: permittedUsername }) => {
    if (username === permittedUsername) {
      permittedModuleIds.add(moduleId);
    }
  });

  const latestByName = new Map<string, ModuleRecord>();
  modules.forEach((module) => {
    if (!module.enabled || !permittedModuleIds.has(module.id)) {
      return;
    }

    const current = latestByName.get(module.name);
    if (
      !current ||
      module.version > current.version ||
      (module.version === current.version && module.id > current.id)
    ) {
      latestByName.set(module.name, module);
    }
  });

  return [...latestByName.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
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

function jsonResponse(
  body: object,
  status = 200,
  corsHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
