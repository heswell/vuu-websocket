import {
  MODULE_ADMIN_RPC,
  MODULE_ADMIN_RPC_CONTRACT,
  parseModuleConfig,
  parseModuleConfigChanges,
  toModuleConfig,
  validateModuleConfig,
  type CreateModuleRpcResult,
  type DeleteModuleRpcResult,
  type ManagedModule,
  type ModuleAdminRpcName,
  type ModuleConfig,
  type ModuleConfigChanges,
  type ModuleValidationErrors,
  type SetModuleEnabledRpcResult,
  type UpdateModuleRpcResult,
} from "./ModuleAdminContract";

export type ModuleAdminRpcOutcome<T = unknown> = {
  modules: ManagedModule[];
  result: T;
};

type NamedParams = Record<string, unknown>;

export const isModuleAdminRpcName = (value: string): value is ModuleAdminRpcName =>
  value in MODULE_ADMIN_RPC_CONTRACT;

export const readModuleAdminRpcParams = (
  rpcName: ModuleAdminRpcName,
  params: unknown,
): NamedParams => {
  if (!isRecord(params)) {
    throw new Error(`${rpcName} requires named parameters`);
  }
  const contract = MODULE_ADMIN_RPC_CONTRACT[rpcName];
  const allowed = new Set([...contract.required, ...contract.optional]);
  for (const key of Object.keys(params)) {
    if (!allowed.has(key)) throw new Error(`Unknown RPC param "${key}"`);
  }
  for (const key of contract.required) {
    if (!(key in params)) throw new Error(`Missing required RPC param "${key}"`);
  }
  return params;
};

export const nextModuleId = (modules: readonly Pick<ManagedModule, "id">[]) =>
  Math.max(0, ...modules.map(({ id }) => id)) + 1;

export const formatModuleValidationErrors = (
  errors: ModuleValidationErrors,
) =>
  Object.entries(errors)
    .filter(([, message]) => message)
    .map(([field, message]) => `${field}: ${message}`)
    .join("; ");

export function executeModuleAdminRpc(
  modules: readonly ManagedModule[],
  rpcName: ModuleAdminRpcName,
  params: unknown,
  now = Date.now,
): ModuleAdminRpcOutcome {
  switch (rpcName) {
    case MODULE_ADMIN_RPC.createModule:
      return createModule(modules, readModuleAdminRpcParams(rpcName, params), now);
    case MODULE_ADMIN_RPC.updateModule:
      return updateModule(modules, readModuleAdminRpcParams(rpcName, params), now);
    case MODULE_ADMIN_RPC.setModuleEnabled:
      return setModuleEnabled(modules, readModuleAdminRpcParams(rpcName, params), now);
    case MODULE_ADMIN_RPC.deleteModule:
      return deleteModule(modules, readModuleAdminRpcParams(rpcName, params));
  }
}

export function createModule(
  modules: readonly ManagedModule[],
  params: unknown,
  now = Date.now,
): ModuleAdminRpcOutcome<CreateModuleRpcResult> {
  const namedParams = readModuleAdminRpcParams(MODULE_ADMIN_RPC.createModule, params);
  const config = parseModuleConfig(stringParam(namedParams, "module"));
  assertValidConfig(config, modules);
  const timestamp = now();
  const module: ManagedModule = {
    ...config,
    id: nextModuleId(modules),
    version: 1,
    created: timestamp,
    updated: timestamp,
  };
  return {
    modules: cloneModules([...modules, module]),
    result: { id: module.id, version: module.version },
  };
}

export function updateModule(
  modules: readonly ManagedModule[],
  params: unknown,
  now = Date.now,
): ModuleAdminRpcOutcome<UpdateModuleRpcResult> {
  const namedParams = readModuleAdminRpcParams(MODULE_ADMIN_RPC.updateModule, params);
  const id = integerParam(namedParams, "id");
  const expectedVersion = integerParam(namedParams, "expectedVersion");
  const changes = parseModuleConfigChanges(stringParam(namedParams, "changes"));
  const module = findModule(modules, id);
  if (module.version !== expectedVersion) {
    throw new Error(`stale update: module ${module.name} is now version ${module.version}`);
  }
  if (!hasActualChanges(module, changes)) {
    return {
      modules: cloneModules(modules),
      result: { id, version: module.version },
    };
  }
  const updated: ManagedModule = {
    ...module,
    ...changes,
    version: module.version + 1,
    updated: now(),
  };
  const next = modules.map((item) => item.id === id ? updated : item);
  assertValidConfig(toModuleConfig(updated), next, id);
  return {
    modules: cloneModules(next),
    result: { id, version: updated.version },
  };
}

export function setModuleEnabled(
  modules: readonly ManagedModule[],
  params: unknown,
  now = Date.now,
): ModuleAdminRpcOutcome<SetModuleEnabledRpcResult> {
  const namedParams = readModuleAdminRpcParams(MODULE_ADMIN_RPC.setModuleEnabled, params);
  const id = integerParam(namedParams, "id");
  const enabled = booleanParam(namedParams, "enabled");
  const module = findModule(modules, id);
  if (module.enabled === enabled) {
    return {
      modules: cloneModules(modules),
      result: { id, version: module.version },
    };
  }
  const updated: ManagedModule = { ...module, enabled, updated: now() };
  const next = modules.map((item) => item.id === id ? updated : item);
  assertValidConfig(toModuleConfig(updated), next, id);
  return {
    modules: cloneModules(next),
    result: { id, version: updated.version },
  };
}

export function deleteModule(
  modules: readonly ManagedModule[],
  params: unknown,
): ModuleAdminRpcOutcome<DeleteModuleRpcResult> {
  const namedParams = readModuleAdminRpcParams(MODULE_ADMIN_RPC.deleteModule, params);
  const id = integerParam(namedParams, "id");
  const deleteChildren = optionalBooleanParam(namedParams, "deleteChildren") ?? false;
  const module = findModule(modules, id);
  const children = modules.filter(({ parentModuleId }) => parentModuleId === id);
  if (children.length && !deleteChildren) {
    throw new Error(
      `module ${module.name} has child modules: ${children.map(({ name }) => name).join(", ")}`,
    );
  }
  const deletedIds = [id, ...children.map(({ id }) => id)];
  const deleted = new Set(deletedIds);
  return {
    modules: cloneModules(modules.filter((item) => !deleted.has(item.id))),
    result: { deletedIds },
  };
}

function assertValidConfig(
  config: ModuleConfig,
  modules: readonly ManagedModule[],
  id?: number,
) {
  const message = formatModuleValidationErrors(validateModuleConfig(config, modules, id));
  if (message) throw new Error(message);
}

function findModule(modules: readonly ManagedModule[], id: number) {
  const module = modules.find((item) => item.id === id);
  if (!module) throw new Error(`module ${id} does not exist`);
  return module;
}

function hasActualChanges(module: ManagedModule, changes: ModuleConfigChanges) {
  return Object.entries(changes).some(
    ([key, value]) => module[key as keyof ModuleConfigChanges] !== value,
  );
}

function stringParam(params: NamedParams, name: string) {
  const value = params[name];
  if (typeof value !== "string") throw new Error(`Invalid RPC param "${name}"`);
  return value;
}

function integerParam(params: NamedParams, name: string) {
  const value = params[name];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Invalid RPC param "${name}"`);
  }
  return value;
}

function booleanParam(params: NamedParams, name: string) {
  const value = params[name];
  if (typeof value !== "boolean") throw new Error(`Invalid RPC param "${name}"`);
  return value;
}

function optionalBooleanParam(params: NamedParams, name: string) {
  return params[name] === undefined ? undefined : booleanParam(params, name);
}

function cloneModules(modules: readonly ManagedModule[]) {
  return modules.map((module) => ({ ...module }));
}

function isRecord(value: unknown): value is NamedParams {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
