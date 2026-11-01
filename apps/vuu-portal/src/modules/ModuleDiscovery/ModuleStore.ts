import fs from "node:fs";
import path from "node:path";
import {
  type ManagedModule,
  normalizeModuleWorkspace,
  validateModuleConfig,
} from "@heswell/module-admin";

// Bun's built-in YAML support is read lazily so that the package can be
// imported (e.g. for its types and module factories) outside of Bun.
const yaml = () => {
  if (typeof Bun === "undefined" || !Bun.YAML) {
    throw new Error("@heswell/vuu-portal module files require the Bun runtime");
  }
  return Bun.YAML;
};

export interface ModuleStore {
  load(): ManagedModule[];
  save(modules: readonly ManagedModule[]): void;
}

export class InMemoryModuleStore implements ModuleStore {
  constructor(private modules: readonly ManagedModule[] = []) { }

  load() {
    return cloneModules(this.modules);
  }

  save(modules: readonly ManagedModule[]) {
    this.modules = cloneModules(modules);
  }
}

export class ModuleState {
  #modules: ManagedModule[];

  constructor(
    private readonly store: ModuleStore,
    modules: readonly ManagedModule[],
  ) {
    this.#modules = cloneModules(modules);
  }

  get modules() {
    return cloneModules(this.#modules);
  }

  replaceAndSave(modules: readonly ManagedModule[]) {
    const next = cloneModules(modules);
    this.store.save(next);
    this.#modules = next;
  }
}

export class YamlModuleStore implements ModuleStore {
  constructor(
    private readonly filePath: string,
    private readonly seedModules: () => readonly ManagedModule[],
  ) { }

  load() {
    if (!fs.existsSync(this.filePath)) {
      const seeded = cloneModules(this.seedModules());
      assertValidManagedModules(seeded, this.filePath);
      this.save(seeded);
      return seeded;
    }

    const modules = readModulesFile(this.filePath).map((value, index) =>
      parseManagedModule(value, index),
    );
    assertValidManagedModules(modules, this.filePath);
    return modules;
  }

  save(modules: readonly ManagedModule[]) {
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });
    const tempPath = path.join(
      directory,
      `.${path.basename(this.filePath)}.${process.pid}.${Date.now()}.tmp`,
    );
    const contents = yaml().stringify({ modules: cloneModules(modules) }, null, 2);
    try {
      fs.writeFileSync(tempPath, contents, "utf8");
      fs.renameSync(tempPath, this.filePath);
    } catch (error) {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {
        // best-effort cleanup
      }
      throw error;
    }
  }
}

export function createModuleState(store: ModuleStore) {
  return new ModuleState(store, store.load());
}

/**
 * Reads the default module catalog used to seed `modules.yaml`. Entries have
 * the same fields as `modules.yaml`, except `created` and `updated`, which are
 * set to `timestamp`.
 */
export function loadDefaultModules(filePath: string, timestamp: number) {
  const modules = readModulesFile(filePath).map((value, index) =>
    parseManagedModule(
      isRecord(value) ? { ...value, created: timestamp, updated: timestamp } : value,
      index,
    ),
  );
  assertValidManagedModules(modules, filePath);
  return modules;
}

function readModulesFile(filePath: string): unknown[] {
  const parsed = yaml().parse(fs.readFileSync(filePath, "utf8")) as unknown;
  if (!isRecord(parsed) || !Array.isArray(parsed.modules)) {
    throw new Error(`Modules file '${filePath}' must contain a 'modules' list`);
  }
  return parsed.modules;
}

function cloneModules(modules: readonly ManagedModule[]) {
  // Unset optional fields are dropped so they are not written to YAML.
  return modules.map(
    (module) =>
      Object.fromEntries(
        Object.entries(module)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, cloneValue(value)]),
      ) as ManagedModule,
  );
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneValue(item)]),
    );
  }
  return value;
}

const managedModuleKeys = [
  "id",
  "version",
  "created",
  "updated",
  "parentModuleId",
  "name",
  "title",
  "description",
  "enabled",
  "location",
  "path",
  "mfComponent",
  "mfScope",
  "mfUrl",
  "navIconUrl",
  "accessRole",
] as const satisfies readonly (keyof ManagedModule)[];

const navEntryKeys: readonly string[] = ["location", "path"];

const optionalModuleKeys = [
  "navOrder",
  "navBadge",
  "notificationTopics",
  "workspace",
] as const satisfies readonly (keyof ManagedModule)[];

// Fields written by earlier versions; ignored on load and dropped on next save.
const retiredModuleKeys = ["vuuConnectionId", "vuuWebsocketUrl", "vuuRestUrl"];

function parseManagedModule(value: unknown, index: number): ManagedModule {
  if (!isRecord(value)) {
    throw new Error(`Modules file entry ${index} must be an object`);
  }
  for (const key of Object.keys(value)) {
    if (
      !(managedModuleKeys as readonly string[]).includes(key) &&
      !(optionalModuleKeys as readonly string[]).includes(key) &&
      !retiredModuleKeys.includes(key)
    ) {
      throw new Error(`Modules file entry ${index} contains unknown field '${key}'`);
    }
  }
  const module: Record<string, unknown> = {};
  for (const key of managedModuleKeys) {
    // Palette-only and nested modules have no nav entry, so these may be omitted.
    const fieldValue =
      value[key] === undefined && navEntryKeys.includes(key) ? "" : value[key];
    if (fieldValue === undefined) {
      throw new Error(`Modules file entry ${index} is missing '${key}'`);
    }
    const expected = ["id", "version", "created", "updated", "parentModuleId"].includes(key)
      ? "number"
      : key === "enabled"
        ? "boolean"
        : "string";
    if (typeof fieldValue !== expected) {
      throw new Error(`Modules file entry ${index} field '${key}' must be a ${expected}`);
    }
    if (expected === "number" && !Number.isInteger(fieldValue)) {
      throw new Error(`Modules file entry ${index} field '${key}' must be an integer`);
    }
    module[key] = fieldValue;
  }
  for (const key of optionalModuleKeys) {
    const fieldValue = value[key];
    if (fieldValue === undefined || fieldValue === null) continue;
    if (key === "workspace") {
      // Its fields are checked by validateModuleConfig.
      if (!isRecord(fieldValue)) {
        throw new Error(`Modules file entry ${index} field 'workspace' must be an object`);
      }
      module[key] = cloneValue(normalizeModuleWorkspace(fieldValue));
      continue;
    }
    const valid =
      key === "navOrder"
        ? typeof fieldValue === "number"
        : key === "navBadge"
          ? typeof fieldValue === "string"
          : Array.isArray(fieldValue) &&
            fieldValue.every((topic) => typeof topic === "string");
    if (!valid) {
      const expected =
        key === "navOrder"
          ? "a number"
          : key === "navBadge"
            ? "a string"
            : "a list of strings";
      throw new Error(`Modules file entry ${index} field '${key}' must be ${expected}`);
    }
    module[key] = Array.isArray(fieldValue) ? [...fieldValue] : fieldValue;
  }
  return module as ManagedModule;
}

function assertValidManagedModules(modules: readonly ManagedModule[], filePath: string) {
  const ids = new Set<number>();
  modules.forEach((module, index) => {
    if (ids.has(module.id)) {
      throw new Error(`Modules file '${filePath}' contains duplicate id ${module.id}`);
    }
    ids.add(module.id);
    const errors = validateModuleConfig(module, modules, module.id);
    const message = formatValidationErrors(errors);
    if (message) {
      throw new Error(`Modules file '${filePath}' entry ${index} is invalid: ${message}`);
    }
  });
}

function formatValidationErrors(errors: Record<string, string | undefined>) {
  return Object.entries(errors)
    .filter(([, message]) => message)
    .map(([field, message]) => `${field}: ${message}`)
    .join("; ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
