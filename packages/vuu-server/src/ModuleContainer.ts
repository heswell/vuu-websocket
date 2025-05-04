import { VuuRpcServiceRequest, VuuTable } from "@vuu-ui/vuu-protocol-types";
import { Module } from "./Module";
import { ProviderFactory } from "./Provider";
import { tableDefToSchema } from "./tableDefToSchema";
import { Table } from "@heswell/data";
import { ServiceFactory, ServiceMessage } from "./Service";
import { TableDef } from "./TableDef";
import { Viewport } from "./ViewportContainer";
import { RpcHandlerFactory } from "./RpcRegistry";

export interface TableContainer {
  getTable: ({ module, table }: VuuTable) => Table;
}

export class ModuleContainer implements TableContainer {
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

  #modules = new Map<string, Module>();

  private tableBuilder(moduleName: string) {
    return {
      addRpcHandler: (rpcFactory: RpcHandlerFactory) => {
        console.log(`addRpcHandler ${moduleName}`);
        const module = this.getModule(moduleName);
        module.addRpcHandler(rpcFactory(ModuleContainer.instance));
        console.log({ module });
        return this.tableBuilder(moduleName);
      },
      addTable: (
        { links, ...tableDef }: TableDef,
        providerFactory: ProviderFactory,
        serviceFactory?: ServiceFactory
      ) => {
        const module = this.getModule(moduleName);
        const table = new Table({
          schema: tableDefToSchema(moduleName, tableDef),
        });
        module.addTable(table, providerFactory(table), serviceFactory?.(table));
        if (links) {
          module.addLinks(table, links);
        }
        return this.tableBuilder(moduleName);
      },
      // asModule: () => this.startModule(moduleName),
      asModule: () => this.getModule(moduleName),
    };
  }

  withNameSpace = (name: string) => {
    if (!this.#modules.has(name)) {
      this.#modules.set(name, new Module({ name }));
    }
    return this.tableBuilder(name);
  };

  private startModule(name: string) {
    this.getModule(name).start();
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

  getTable({ module, table }: VuuTable) {
    return this.getModule(module).getTable(table);
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

export const startModulerContainer = () => {
  return ModuleContainer.instance;
};

export default ModuleContainer.instance;
