import { VuuLink, VuuTable } from "@vuu-ui/vuu-protocol-types";
import { Module } from "./Module";
import { Viewport } from "@heswell/vuuserver";
import { ProviderFactory } from "./Provider";
import { tableDefToSchema } from "./tableDefToSchema";
import { Table } from "@heswell/data";
import { ServiceFactory, ServiceMessage } from "./Service";

export type Column = {
  name: string;
  dataType: "string" | "double" | "int" | "long" | "boolean";
};

export interface TableDef {
  columns: Column[];
  joinFields?: string | string[];
  keyField: string;
  name: string;
  links?: VuuLink[];
}

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

  #modules = new Map<string, Module>();

  private tableBuilder(moduleName: string) {
    return {
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
      asModule: () => this.startModule(moduleName),
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

  invokeService({ module, table }: VuuTable, message: ServiceMessage) {
    return this.getModule(module).invokeService(table, message);
  }
}

export default ModuleContainer.instance;
