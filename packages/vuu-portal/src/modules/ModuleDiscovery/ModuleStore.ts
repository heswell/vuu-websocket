import fs from "node:fs";
import path from "node:path";
import { YAML } from "bun";
import {
  type ManagedModule,
  validateModuleConfig,
} from "@heswell/module-admin";

export interface ModuleStore {
  load(): ManagedModule[];
  save(modules: readonly ManagedModule[]): void;
}

export class InMemoryModuleStore implements ModuleStore {
  constructor(private modules: readonly ManagedModule[] = []) {}

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
  ) {}

  load() {
    if (!fs.existsSync(this.filePath)) {
      const seeded = cloneModules(this.seedModules());
      assertValidManagedModules(seeded, this.filePath);
      this.save(seeded);
      return seeded;
    }

    const parsed = YAML.parse(fs.readFileSync(this.filePath, "utf8")) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.modules)) {
      throw new Error(`Modules file '${this.filePath}' must contain a 'modules' list`);
    }
    const modules = parsed.modules.map((value, index) => parseManagedModule(value, index));
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
    const contents = YAML.stringify({ modules: cloneModules(modules) });
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

function cloneModules(modules: readonly ManagedModule[]) {
  return modules.map((module) => ({ ...module }));
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
  "vuuConnectionId",
  "vuuWebsocketUrl",
  "vuuRestUrl",
  "accessRole",
] as const satisfies readonly (keyof ManagedModule)[];

function parseManagedModule(value: unknown, index: number): ManagedModule {
  if (!isRecord(value)) {
    throw new Error(`Modules file entry ${index} must be an object`);
  }
  for (const key of Object.keys(value)) {
    if (!(managedModuleKeys as readonly string[]).includes(key)) {
      throw new Error(`Modules file entry ${index} contains unknown field '${key}'`);
    }
  }
  const module: Record<string, unknown> = {};
  for (const key of managedModuleKeys) {
    const fieldValue = value[key];
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
