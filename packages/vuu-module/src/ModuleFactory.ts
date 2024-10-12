import { VuuLink, VuuTable } from "@vuu-ui/vuu-protocol-types";
import { Module } from "./Module";
import { ProviderFactory } from "./Provider";
import { tableDefToSchema } from "./tableDefToSchema";
import { Table } from "@heswell/data";

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

export class ModuleFactory {
  #modules = new Map<string, Module>();

  private getModule(name: string) {
    const module = this.#modules.get(name);
    if (module) {
      return module;
    }
    throw Error(`[ModuleFactory] module ${name} not found`);
  }

  private startModule(name: string) {
    this.getModule(name).start();
  }

  private tableBuilder(moduleName: string) {
    return {
      addTable: (
        { links, ...tableDef }: TableDef,
        providerFactory: ProviderFactory
      ) => {
        const module = this.getModule(moduleName);
        const table = new Table({
          schema: tableDefToSchema(moduleName, tableDef),
        });
        module.addTable(table, providerFactory(table));
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

  getLinks({ module, table }: VuuTable) {
    return this.getModule(module).getLinks(table);
  }
}
