import { VuuTable } from "@vuu-ui/vuu-protocol-types";
import { RealizedViewServerModule } from "./VsModule";
import { ServiceMessage } from "../../Service";

export class ModuleContainer {
  constructor() {
    console.log("create ModuleService");
  }

  #modules = new Map<string, RealizedViewServerModule>();

  register(module: RealizedViewServerModule) {
    this.#modules.set(module.name, module);
  }

  public start() {
    console.log(`[ModuleContainer] start ${this.#modules.size} modules`);
    this.#modules.forEach((module) => module.start());
  }

  get(name: string) {
    const module = this.#modules.get(name);
    if (module) {
      return module;
    }
    throw Error(`[ModuleFactory] module ${name} not found`);
  }

  createSessionTableFromSelectedRows(viewport: Viewport) {
    const module = this.get(viewport.table.schema.table.module);
    return module.createSessionTableFromSelectedRows(viewport);
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
