import type {
  ModuleAccessRole,
  ModuleDefinition,
} from "./ModuleDiscoveryContract";

/**
 * Module administration contract shared by the VUU portal server, the
 * module-admin UI and local (in-browser) test data services.
 *
 * Every RPC param is a VUU row value (string | number | boolean); structured
 * values are JSON-encoded strings.
 */

/** Editable configuration of a single remote module. */
export type ModuleConfig = {
  /** 0 for a top-level module, otherwise the id of the opening module. */
  parentModuleId: number;
  /** Unique, immutable identifier. */
  name: string;
  title: string;
  description: string;
  enabled: boolean;
  /** Portal menu location, e.g. `/Trading/Baskets`. Empty for child modules. */
  location: string;
  path: string;
  mfComponent: string;
  mfScope: string;
  mfUrl: string;
  /** Navigation icon as a data URL (SVG) or an http(s) URL. May be empty. */
  navIconUrl: string;
  vuuConnectionId: string;
  vuuWebsocketUrl: string;
  vuuRestUrl: string;
  /**
   * Role a user must hold to be offered the module. Child modules may leave
   * this empty to inherit their parent's access role.
   */
  accessRole: string;
};

/** A module as held by module discovery. */
export type ManagedModule = ModuleConfig & {
  id: number;
  version: number;
  /** Epoch millis. */
  created: number;
  /** Epoch millis. */
  updated: number;
};

export type ModuleConfigChanges = Partial<Omit<ModuleConfig, "name">>;

export const MODULE_ADMIN_RPC = {
  createModule: "createModule",
  updateModule: "updateModule",
  setModuleEnabled: "setModuleEnabled",
  deleteModule: "deleteModule",
} as const;

export type ModuleAdminRpcName = keyof typeof MODULE_ADMIN_RPC;

export type CreateModuleRpcParams = {
  /** JSON-encoded ModuleConfig. */
  module: string;
};
export type CreateModuleRpcResult = { id: number; version: number };

export type UpdateModuleRpcParams = {
  id: number;
  /** JSON-encoded ModuleConfigChanges. `name` is rejected. */
  changes: string;
  /**
   * Version the edit was based on. The update is rejected as stale when the
   * module has since moved on.
   */
  expectedVersion: number;
};
export type UpdateModuleRpcResult = { id: number; version: number };

export type SetModuleEnabledRpcParams = { id: number; enabled: boolean };
export type SetModuleEnabledRpcResult = { id: number; version: number };

export type DeleteModuleRpcParams = {
  id: number;
  /**
   * Delete child modules too. When false, deleting a module that still has
   * children is rejected.
   */
  deleteChildren: boolean;
};
export type DeleteModuleRpcResult = { deletedIds: number[] };

/** Named params each RPC accepts, and which of them are required. */
export const MODULE_ADMIN_RPC_CONTRACT: Record<
  ModuleAdminRpcName,
  { required: readonly string[]; optional: readonly string[] }
> = {
  createModule: { required: ["module"], optional: [] },
  updateModule: { required: ["id", "changes", "expectedVersion"], optional: [] },
  setModuleEnabled: { required: ["id", "enabled"], optional: [] },
  deleteModule: { required: ["id"], optional: ["deleteChildren"] },
};

export const EMPTY_MODULE_CONFIG: ModuleConfig = {
  parentModuleId: 0,
  name: "",
  title: "",
  description: "",
  enabled: false,
  location: "",
  path: "",
  mfComponent: "",
  mfScope: "",
  mfUrl: "",
  navIconUrl: "",
  vuuConnectionId: "",
  vuuWebsocketUrl: "",
  vuuRestUrl: "",
  accessRole: "",
};

const MODULE_CONFIG_KEYS = Object.keys(EMPTY_MODULE_CONFIG) as Array<
  keyof ModuleConfig
>;

export const MODULE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9-]*$/;
export const MF_SCOPE_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
export const ACCESS_ROLE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** `userAdmin` -> `user-admin-access`, `basket-trading` -> `basket-trading-access`. */
export const defaultAccessRole = (name: string) =>
  name
    ? `${name
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/[\s_]+/g, "-")
        .toLowerCase()}-access`
    : "";

export const isChildModule = (module: Pick<ModuleConfig, "parentModuleId">) =>
  module.parentModuleId !== 0;

export const hasVuuConnection = (
  module: Pick<ModuleConfig, "vuuConnectionId">,
) => module.vuuConnectionId !== "";

/**
 * Access role that applies to a module: its own, or for a child module with
 * none, its parent's.
 */
export const effectiveAccessRole = (
  module: Pick<ManagedModule, "accessRole" | "parentModuleId">,
  modules: readonly Pick<ManagedModule, "id" | "accessRole">[],
) =>
  module.accessRole ||
  (module.parentModuleId
    ? (modules.find(({ id }) => id === module.parentModuleId)?.accessRole ?? "")
    : "");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseConfigValues = (
  value: unknown,
  { allowName }: { allowName: boolean },
): Partial<ModuleConfig> => {
  if (!isRecord(value)) {
    throw new Error("Module configuration must be a JSON object");
  }
  const result: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (!MODULE_CONFIG_KEYS.includes(key as keyof ModuleConfig)) {
      throw new Error(`Unknown module field "${key}"`);
    }
    if (key === "name" && !allowName) {
      throw new Error("Module name can't be changed");
    }
    const expected = typeof EMPTY_MODULE_CONFIG[key as keyof ModuleConfig];
    if (typeof fieldValue !== expected) {
      throw new Error(`Module field "${key}" must be a ${expected}`);
    }
    result[key] =
      typeof fieldValue === "string" ? fieldValue.trim() : fieldValue;
  }
  return result as Partial<ModuleConfig>;
};

const parseJson = (json: string, what: string) => {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    throw new Error(`${what} is not valid JSON`);
  }
};

/** Parses the `module` param of createModule. Missing fields take defaults. */
export const parseModuleConfig = (json: string): ModuleConfig => ({
  ...EMPTY_MODULE_CONFIG,
  ...parseConfigValues(parseJson(json, "module"), { allowName: true }),
});

/** Parses the `changes` param of updateModule. */
export const parseModuleConfigChanges = (json: string): ModuleConfigChanges =>
  parseConfigValues(parseJson(json, "changes"), {
    allowName: false,
  }) as ModuleConfigChanges;

export type ModuleValidationErrors = Partial<Record<keyof ModuleConfig, string>>;

const isUrl = (value: string, protocols: readonly string[]) => {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

/**
 * Validates a complete module configuration against the other registered
 * modules. `id` identifies the module being edited, if any. Returns an empty
 * object when the configuration is valid.
 */
export const validateModuleConfig = (
  config: ModuleConfig,
  modules: readonly ManagedModule[],
  id?: number,
): ModuleValidationErrors => {
  const errors: ModuleValidationErrors = {};
  const others = modules.filter((module) => module.id !== id);

  if (!config.title) errors.title = "Title is required";

  if (!config.name) {
    errors.name = "Name is required";
  } else if (!MODULE_NAME_PATTERN.test(config.name)) {
    errors.name =
      "Name must start with a letter and contain only letters, digits and dashes";
  } else if (others.some(({ name }) => name === config.name)) {
    errors.name = `Name "${config.name}" is already used`;
  }

  if (config.parentModuleId !== 0) {
    const parent = modules.find(({ id }) => id === config.parentModuleId);
    if (config.parentModuleId === id) {
      errors.parentModuleId = "A module can't be its own parent";
    } else if (!parent) {
      errors.parentModuleId = "Parent module does not exist";
    } else if (parent.parentModuleId !== 0) {
      errors.parentModuleId = "Parent must be a top-level module";
    } else if (
      id !== undefined &&
      modules.some(({ parentModuleId }) => parentModuleId === id)
    ) {
      errors.parentModuleId = "A module with child modules must be top-level";
    }
  }

  if (config.parentModuleId === 0) {
    const segments = config.location.split("/").filter(Boolean);
    if (!config.location) {
      errors.location = "Menu location is required";
    } else if (!config.location.startsWith("/") || segments.length < 2) {
      errors.location = "Menu location must look like /Section/Label";
    }
    if (!config.path) errors.path = "Route is required";
  } else if (config.location) {
    errors.location = "Child modules have no menu location";
  }

  if (config.path) {
    if (!config.path.startsWith("/")) {
      errors.path = "Route must start with /";
    } else if (others.some(({ path }) => path === config.path)) {
      errors.path = `Route ${config.path} is already used`;
    }
  }

  if (!config.mfUrl) {
    errors.mfUrl = "Remote URL is required";
  } else if (!isUrl(config.mfUrl, ["http:", "https:"])) {
    errors.mfUrl = "Remote URL must be an http(s) URL";
  }

  if (!config.mfScope) {
    errors.mfScope = "Scope is required";
  } else if (!MF_SCOPE_PATTERN.test(config.mfScope)) {
    errors.mfScope = "Scope must be a valid JavaScript identifier";
  } else {
    const owner = others.find(({ mfScope }) => mfScope === config.mfScope);
    if (owner) {
      errors.mfScope = `Scope ${config.mfScope} is already used by ${owner.title}`;
    }
  }

  if (!config.mfComponent) errors.mfComponent = "Exposed component is required";

  if (
    config.navIconUrl &&
    !config.navIconUrl.startsWith("data:image/") &&
    !isUrl(config.navIconUrl, ["http:", "https:"])
  ) {
    errors.navIconUrl = "Icon must be an image data URL or http(s) URL";
  }

  if (
    config.vuuConnectionId ||
    config.vuuWebsocketUrl ||
    config.vuuRestUrl
  ) {
    if (!config.vuuConnectionId) {
      errors.vuuConnectionId = "Connection id is required";
    }
    if (!isUrl(config.vuuWebsocketUrl, ["ws:", "wss:"])) {
      errors.vuuWebsocketUrl = "WebSocket URL must be a ws(s) URL";
    }
    if (!isUrl(config.vuuRestUrl, ["http:", "https:"])) {
      errors.vuuRestUrl = "Auth URL must be an http(s) URL";
    }
  }

  if (config.accessRole) {
    if (!ACCESS_ROLE_PATTERN.test(config.accessRole)) {
      errors.accessRole =
        "Access role may contain only letters, digits, dots, dashes and underscores";
    }
  } else if (config.parentModuleId === 0 && config.enabled) {
    errors.accessRole = "An access role is required to enable a module";
  }

  return errors;
};


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
    vuuConnectionId: definition.vuu?.connectionId ?? "",
    vuuWebsocketUrl: definition.vuu?.websocketUrl ?? "",
    vuuRestUrl: definition.vuu?.restUrl ?? "",
    accessRole: rolesByName.get(definition.name) ?? "",
    id: definition.id,
    version: definition.version,
    created: timestamp,
    updated: timestamp,
  }));
};

export const managedModuleColumnValues = (
  module: ManagedModule,
): Record<string, string | number | boolean> => ({
  id: module.id,
  parentModuleId: module.parentModuleId,
  name: module.name,
  title: module.title,
  description: module.description,
  version: module.version,
  enabled: module.enabled,
  location: module.location,
  path: module.path,
  mfComponent: module.mfComponent,
  mfScope: module.mfScope,
  mfUrl: module.mfUrl,
  vuuConnectionId: module.vuuConnectionId,
  vuuWebsocketUrl: module.vuuWebsocketUrl,
  vuuRestUrl: module.vuuRestUrl,
  navIconUrl: module.navIconUrl,
  vuuCreatedTimestamp: module.created,
  vuuUpdatedTimestamp: module.updated,
  vuuMsg: "",
});

export const managedModulePermissionValues = (
  modules: readonly ManagedModule[],
): Record<string, string | number | boolean>[] =>
  modules
    .filter(({ accessRole }) => accessRole !== "")
    .map((module) => ({
      id: module.id,
      module_id: module.id,
      role: module.accessRole,
      vuuCreatedTimestamp: module.created,
      vuuUpdatedTimestamp: module.updated,
      vuuMsg: "",
    }));

export const toModuleConfig = (module: ModuleConfig): ModuleConfig =>
  Object.fromEntries(
    MODULE_CONFIG_KEYS.map((key) => [key, module[key]]),
  ) as ModuleConfig;
