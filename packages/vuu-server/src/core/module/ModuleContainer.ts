import { VuuRpcServiceRequest, VuuTable } from "@vuu-ui/vuu-protocol-types";
import { RealizedViewServerModule, ViewServerModule } from "./VsModule";
import { ServiceFactory, ServiceMessage } from "../../Service";
import { Viewport } from "../../ViewportContainer";
import { RpcHandlerFactory } from "../../RpcRegistry";
import TableDefContainer from "./TableDefContainer";
import { TableJoinFactory } from "../../TableJoinProvider";
import { TableDefs } from "./ModuleFactory";

export class ModuleContainer {
  static #instance: ModuleContainer;

  public static get instance(): ModuleContainer {
    if (!ModuleContainer.#instance) {
      ModuleContainer.#instance = new ModuleContainer();
    }
    return ModuleContainer.#instance;
  }

  private constructor() {
    console.log("create ModuleService");
  }

  #modules = new Map<string, ViewServerModule>();

  register(module: ViewServerModule) {
    this.#modules.set(module.name, module);
  }

  public start() {
    console.log(`[ModuleContainer] start ${this.#modules.size} modules`);
    this.#modules.forEach((module) => module.start());
  }

  private getModule(name: string) {
    const module = this.#modules.get(name);
    if (module) {
      return module;
    }
    throw Error(`[ModuleFactory] module ${name} not found`);
  }

  createSessionTableFromSelectedRows(viewport: Viewport) {
    const module = this.getModule(viewport.table.schema.table.module);
    return module.createSessionTableFromSelectedRows(viewport);
  }

  getLinks({ module, table }: VuuTable) {
    return this.getModule(module).getLinks(table);
  }

  get tableList() {
    const tableList: VuuTable[] = [];
    for (const module of this.#modules.values()) {
      tableList.push(...module.getTableList());
    }
    return tableList;
  }

  getTableSchema({ module, table }: VuuTable) {
    return this.getModule(module).getTableSchema(table);
  }

  getMenu({ module, table }: VuuTable) {
    return this.getModule(module).getMenu(table);
  }

  getRpcHandler(module: string, service: string, method: string) {
    console.log(`[ModuleContainer] getRpcHandler ${module} ${service}`);
    // TODO what about module ?
    return this.getModule(module).getRpcHandler(service, method);
  }

  invokeService({ module, table }: VuuTable, message: ServiceMessage) {
    return this.getModule(module).invokeService(table, message);
  }
}

export default ModuleContainer.instance;
