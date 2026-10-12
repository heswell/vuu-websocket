import { VuuTable } from "@vuu-ui/vuu-protocol-types";
import { RealizedViewServerModule } from "./VsModule";
import { ServiceMessage } from "../../Service";
import { getLogger } from "@heswell/service-utils";

const log = getLogger("vuu.module");

export class ModuleContainer {
  constructor() {
    log.debug("create ModuleContainer");
  }

  #modules = new Map<string, RealizedViewServerModule>();

  register(module: RealizedViewServerModule) {
    this.#modules.set(module.name, module);
  }

  public async start() {
    log.debug(`start ${this.#modules.size} modules`);
    for (const module of this.#modules.values()) {
      await module.start();
    }
  }

  public async stop() {
    log.debug(`stop ${this.#modules.size} modules`);
    const errors: unknown[] = [];
    for (const module of [...this.#modules.values()].toReversed()) {
      try {
        await module.stop();
      } catch (error: unknown) {
        errors.push(error);
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "[ModuleContainer] stop failed");
    }
  }

  get(name: string) {
    const module = this.#modules.get(name);
    if (module) {
      return module;
    }
    throw Error(`[ModuleFactory] module ${name} not found`);
  }

  getLinks({ module, table }: VuuTable) {
    return this.get(module).getLinks(table);
  }

  get tableList() {
    const tableList: VuuTable[] = [];
    for (const module of this.#modules.values()) {
      tableList.push(...module.getTableList());
    }
    return tableList;
  }

  getTableSchema({ module, table }: VuuTable) {
    return this.get(module).getTableSchema(table);
  }

  getMenu({ module, table }: VuuTable) {
    return this.get(module).getMenu(table);
  }

  invokeService({ module, table }: VuuTable, message: ServiceMessage) {
    return this.get(module).invokeService(table, message);
  }
}
