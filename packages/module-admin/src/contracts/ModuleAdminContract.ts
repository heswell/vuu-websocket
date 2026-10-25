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
  /**
   * Role a user must hold to be offered the module. Child modules may leave
   * this empty to inherit their parent's access role.
   */
  accessRole: string;
  /**
   * Sort order within the module's nav section. Lower numbers first; modules
   * without one come after those with one.
   */
  navOrder?: number;
  /**
   * Opaque badge-source key, e.g. `orders.working`. The client maps it to a
   * live value; the server only stores and forwards it.
   */
  navBadge?: string;
  /** Notification topics the module claims, e.g. `["orders", "fills"]`. */
  notificationTopics?: string[];
  /**
   * Workspace placement metadata. A module with it is listed in the portal's
   * Panels palette and can be placed in a workspace; a module without it is
   * not (e.g. a nested module that only works inside its parent).
   */
  workspace?: ModuleWorkspace;
};

/** Default size of a module placed in a workspace grid, in grid tracks. */
export type ModuleWorkspaceSize = {
  cols?: number;
  rows?: number;
};

/** How a module is offered in the portal's Panels palette. */
export type ModuleWorkspace = {
  /** Palette group heading, e.g. `Trading`. */
  paletteGroup: string;
  /**
   * Palette icon as a data URL (SVG) or an http(s) URL. Falls back to the
   * module's `navIconUrl` when absent.
   */
  iconUrl?: string;
  defaultSize?: ModuleWorkspaceSize;
};

export const MODULE_WORKSPACE_KEYS = [
  "paletteGroup",
  "iconUrl",
  "defaultSize",
] as const satisfies readonly (keyof ModuleWorkspace)[];

export const MODULE_WORKSPACE_SIZE_KEYS = [
  "cols",
  "rows",
] as const satisfies readonly (keyof ModuleWorkspaceSize)[];

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
  accessRole: "",
};

/** Optional nav metadata fields. Absent (undefined) when unset. */
export const OPTIONAL_MODULE_CONFIG_KEYS = [
  "navOrder",
  "navBadge",
  "notificationTopics",
  "workspace",
] as const satisfies readonly (keyof ModuleConfig)[];

type OptionalModuleConfigKey = (typeof OPTIONAL_MODULE_CONFIG_KEYS)[number];

const isOptionalKey = (key: string): key is OptionalModuleConfigKey =>
  (OPTIONAL_MODULE_CONFIG_KEYS as readonly string[]).includes(key);

const MODULE_CONFIG_KEYS = [
  ...(Object.keys(EMPTY_MODULE_CONFIG) as Array<keyof ModuleConfig>),
  ...OPTIONAL_MODULE_CONFIG_KEYS,
];

/**
 * `notificationTopics` are stored in the `modules` VUU table as a single
 * comma-separated string, so a topic may not contain a comma.
 */
export const NOTIFICATION_TOPIC_SEPARATOR = ",";

export const joinNotificationTopics = (topics: readonly string[] | undefined) =>
  topics?.join(NOTIFICATION_TOPIC_SEPARATOR) ?? "";

export const splitNotificationTopics = (value: string) =>
  value
    .split(NOTIFICATION_TOPIC_SEPARATOR)
    .map((topic) => topic.trim())
    .filter(Boolean);

/**
 * `workspace` is stored in the `modules` VUU table as a JSON-encoded string,
 * `""` when unset.
 */
export const serializeModuleWorkspace = (
  workspace: ModuleWorkspace | undefined,
) => (workspace ? JSON.stringify(workspace) : "");

/**
 * Reads a `workspace` column value. Returns `undefined` when it is empty or
 * not a valid workspace, so a bad row never breaks module discovery.
 */
export const deserializeModuleWorkspace = (
  value: unknown,
): ModuleWorkspace | undefined => {
  if (typeof value !== "string" || value === "") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }
  return moduleWorkspaceError(parsed) === undefined
    ? (parsed as ModuleWorkspace)
    : undefined;
};

/**
 * Normalises a `workspace` value: trims strings and drops optional parts
 * that are `null` or empty. Anything it does not recognise is left for
 * {@link moduleWorkspaceError} to report.
 */
export const normalizeModuleWorkspace = (value: unknown): unknown => {
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = { ...value };
  if (typeof result.paletteGroup === "string") {
    result.paletteGroup = result.paletteGroup.trim();
  }
  if (typeof result.iconUrl === "string") {
    result.iconUrl = result.iconUrl.trim();
  }
  if (result.iconUrl === null || result.iconUrl === "") delete result.iconUrl;
  if (isRecord(result.defaultSize)) {
    const size = Object.fromEntries(
      Object.entries(result.defaultSize).filter(
        ([, dimension]) => dimension !== null && dimension !== undefined,
      ),
    );
    if (Object.keys(size).length) {
      result.defaultSize = size;
    } else {
      delete result.defaultSize;
    }
  } else if (result.defaultSize === null) {
    delete result.defaultSize;
  }
  return result;
};

const isPositiveInteger = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

/**
 * Validates a `workspace` value. Returns an error message, or `undefined`
 * when it is valid.
 */
export const moduleWorkspaceError = (value: unknown): string | undefined => {
  if (!isRecord(value)) return "Workspace must be an object";
  const unknownKey = Object.keys(value).find(
    (key) => !(MODULE_WORKSPACE_KEYS as readonly string[]).includes(key),
  );
  if (unknownKey !== undefined) {
    return `Workspace has unknown field "${unknownKey}"; expected ${MODULE_WORKSPACE_KEYS.join(", ")}`;
  }
  const { paletteGroup, iconUrl, defaultSize } = value;
  if (typeof paletteGroup !== "string" || paletteGroup.trim() === "") {
    return "Workspace palette group is required";
  }
  if (
    iconUrl !== undefined &&
    (typeof iconUrl !== "string" ||
      (!iconUrl.startsWith("data:image/") &&
        !isUrl(iconUrl, ["http:", "https:"])))
  ) {
    return "Workspace icon must be an image data URL or http(s) URL";
  }
  if (defaultSize !== undefined) {
    if (!isRecord(defaultSize)) {
      return "Workspace default size must be an object";
    }
    const unknownSizeKey = Object.keys(defaultSize).find(
      (key) => !(MODULE_WORKSPACE_SIZE_KEYS as readonly string[]).includes(key),
    );
    if (unknownSizeKey !== undefined) {
      return `Workspace default size has unknown field "${unknownSizeKey}"; expected ${MODULE_WORKSPACE_SIZE_KEYS.join(", ")}`;
    }
    for (const key of MODULE_WORKSPACE_SIZE_KEYS) {
      if (defaultSize[key] !== undefined && !isPositiveInteger(defaultSize[key])) {
        return `Workspace default size ${key} must be a positive integer`;
      }
    }
  }
  return undefined;
};

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
    if (isOptionalKey(key)) {
      // null (or an empty value) clears the field.
      result[key] = parseOptionalValue(key, fieldValue);
      continue;
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

const parseOptionalValue = (
  key: OptionalModuleConfigKey,
  value: unknown,
): ModuleConfig[OptionalModuleConfigKey] => {
  if (value === null || value === undefined) return undefined;
  switch (key) {
    case "navOrder":
      if (typeof value !== "number") {
        throw new Error(`Module field "navOrder" must be a number`);
      }
      return value;
    case "navBadge":
      if (typeof value !== "string") {
        throw new Error(`Module field "navBadge" must be a string`);
      }
      return value.trim() || undefined;
    case "notificationTopics":
      if (
        !Array.isArray(value) ||
        !value.every((topic) => typeof topic === "string")
      ) {
        throw new Error(
          `Module field "notificationTopics" must be an array of strings`,
        );
      }
      return value.length
        ? value.map((topic: string) => topic.trim())
        : undefined;
    case "workspace": {
      const workspace = normalizeModuleWorkspace(value);
      const error = moduleWorkspaceError(workspace);
      if (error) throw new Error(`workspace: ${error}`);
      return workspace as ModuleWorkspace;
    }
  }
};

const parseJson = (json: string, what: string) => {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    throw new Error(`${what} is not valid JSON`);
  }
};

const withoutUndefined = <T extends object>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  ) as T;

/** Parses the `module` param of createModule. Missing fields take defaults. */
export const parseModuleConfig = (json: string): ModuleConfig =>
  withoutUndefined({
    ...EMPTY_MODULE_CONFIG,
    ...parseConfigValues(parseJson(json, "module"), { allowName: true }),
  });

/**
 * Parses the `changes` param of updateModule. An optional nav field given as
 * `null` is returned as `undefined`, which clears it.
 */
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

  if (config.accessRole) {
    if (!ACCESS_ROLE_PATTERN.test(config.accessRole)) {
      errors.accessRole =
        "Access role may contain only letters, digits, dots, dashes and underscores";
    }
  } else if (config.parentModuleId === 0 && config.enabled) {
    errors.accessRole = "An access role is required to enable a module";
  }

  if (
    config.navOrder !== undefined &&
    (typeof config.navOrder !== "number" || !Number.isFinite(config.navOrder))
  ) {
    errors.navOrder = "Nav order must be a finite number";
  }

  if (config.navBadge !== undefined && typeof config.navBadge !== "string") {
    errors.navBadge = "Nav badge must be a string";
  }

  if (config.notificationTopics !== undefined) {
    if (
      !Array.isArray(config.notificationTopics) ||
      !config.notificationTopics.every(
        (topic) => typeof topic === "string" && topic.trim() !== "",
      )
    ) {
      errors.notificationTopics =
        "Notification topics must be an array of non-empty strings";
    } else if (
      config.notificationTopics.some((topic) =>
        topic.includes(NOTIFICATION_TOPIC_SEPARATOR),
      )
    ) {
      errors.notificationTopics = "Notification topics may not contain commas";
    }
  }

  if (config.workspace !== undefined) {
    const workspaceError = moduleWorkspaceError(config.workspace);
    if (workspaceError) errors.workspace = workspaceError;
  }

  return errors;
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
  navIconUrl: module.navIconUrl,
  // Left empty when unset.
  ...(module.navOrder !== undefined ? { navOrder: module.navOrder } : {}),
  navBadge: module.navBadge ?? "",
  notificationTopics: joinNotificationTopics(module.notificationTopics),
  workspace: serializeModuleWorkspace(module.workspace),
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
    MODULE_CONFIG_KEYS.filter((key) => module[key] !== undefined).map((key) => [
      key,
      module[key],
    ]),
  ) as ModuleConfig;
