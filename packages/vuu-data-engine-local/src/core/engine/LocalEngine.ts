import type {
  DataSourceConfig,
  SessionDataSourceOverrides,
  TableSchema,
} from "@vuu-ui/vuu-data-types";
import type { VuuTable } from "@vuu-ui/vuu-protocol-types";
import type { VuuModule } from "../module/VuuModule";
import { TableContainer } from "../table/TableContainer";

// biome-ignore lint/suspicious/noExplicitAny: Modules use different table-name unions.
export type AnyVuuModule = VuuModule<any>;

export interface LocalEngineOptions {
  /** Modules to register on creation. */
  modules?: AnyVuuModule[];
}

/**
 * An in-browser Vuu server: a set of VuuModules and the tables they publish,
 * keyed by `{module, table}`. Engines are fully isolated from each other, so
 * two engines (or two modules in one engine) can use the same table names.
 *
 * The engine has no React or DOM dependency. Use `createDataSourceProvider`
 * or `createLocalVuuServer` (from the `/react` entry) to expose it to a
 * React app.
 */
export class LocalEngine {
  readonly tableContainer = new TableContainer();
  #modules = new Map<string, AnyVuuModule>();
  #disposed = false;

  constructor({ modules = [] }: LocalEngineOptions = {}) {
    for (const module of modules) {
      this.register(module);
    }
  }

  /**
   * Register a module. A module already registered under the same name is
   * replaced (and unregistered). Its tables are added to `tableContainer`,
   * keyed by `{module: module.name, table}`.
   */
  register<M extends AnyVuuModule>(module: M): M {
    const existing = this.#modules.get(module.name);
    if (existing === module) {
      return module;
    } else if (existing) {
      this.unregister(existing.name);
    }
    this.#modules.set(module.name, module);
    for (const [tableName, table] of Object.entries(module.getTables())) {
      this.tableContainer.addTable(table, {
        module: module.name,
        table: tableName,
      });
    }
    module.attachEngine(this);
    return module;
  }

  /** Remove a module and its tables. The module is not disposed. */
  unregister(moduleName: string) {
    const module = this.#modules.get(moduleName);
    if (module) {
      this.#modules.delete(moduleName);
      for (const tableName of module.getTableList()) {
        this.tableContainer.removeTable({
          module: moduleName,
          table: tableName,
        });
      }
      module.detachEngine(this);
      return true;
    }
    return false;
  }

  hasModule(moduleName: string) {
    return this.#modules.has(moduleName);
  }

  getModule<M extends AnyVuuModule = AnyVuuModule>(moduleName: string): M {
    const module = this.#modules.get(moduleName);
    if (module) {
      return module as M;
    }
    throw Error(`[LocalEngine] module ${moduleName} not found`);
  }

  get modules(): AnyVuuModule[] {
    return Array.from(this.#modules.values());
  }

  get moduleNames(): string[] {
    return Array.from(this.#modules.keys());
  }

  /** Every table published by the registered modules. */
  getTableList(): VuuTable[] {
    return this.modules.flatMap((module) =>
      module.getTableList().map((table) => ({ module: module.name, table })),
    );
  }

  getTableSchema({ module, table }: VuuTable): TableSchema | undefined {
    return this.getModule(module).getTableSchema(table);
  }

  createDataSource(
    { module, table }: VuuTable,
    viewport?: string,
    config?: DataSourceConfig & { session?: SessionDataSourceOverrides },
  ) {
    return this.getModule(module).createDataSource(table, viewport, config);
  }

  get disposed() {
    return this.#disposed;
  }

  /**
   * Unregister every module and dispose those owned by this engine (that is,
   * first registered here), stopping any timers they started.
   */
  dispose() {
    for (const module of this.modules) {
      const owned = module.engine === this;
      this.unregister(module.name);
      if (owned) {
        module.dispose();
      }
    }
    this.tableContainer.clear();
    this.#disposed = true;
  }
}

/** Create an isolated local engine, optionally registering modules. */
export const createLocalEngine = (options?: LocalEngineOptions) =>
  new LocalEngine(options);

let defaultEngine: LocalEngine | undefined;

/**
 * The shared engine behind the deprecated globals (`tableContainer`,
 * `LocalDataSourceProvider`, `ensureVuuModule`) and the `/legacy` entry.
 * Created on first use.
 */
export const getDefaultEngine = () => {
  if (defaultEngine === undefined || defaultEngine.disposed) {
    defaultEngine = new LocalEngine();
  }
  return defaultEngine;
};

/** Dispose the default engine; the next `getDefaultEngine()` creates a new one. */
export const resetDefaultEngine = () => {
  defaultEngine?.dispose();
  defaultEngine = undefined;
};

/**
 * Register a module with the default engine, unless a module with that name
 * is already registered there.
 * @deprecated create an engine with `createLocalEngine({ modules })`.
 */
export const ensureVuuModule = <T extends AnyVuuModule>(module: T) => {
  const engine = getDefaultEngine();
  if (!engine.hasModule(module.name)) {
    engine.register(module);
  }
  return module;
};
