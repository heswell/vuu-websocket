import { VuuTable } from "@vuu-ui/vuu-protocol-types";
import { ModuleFactory } from "./ModuleFactory";

export class ModuleService {
  static #instance: ModuleService;
  public static get instance(): ModuleService {
    if (!ModuleService.#instance) {
      ModuleService.#instance = new ModuleService();
    }
    return ModuleService.#instance;
  }

  private constructor() {
    console.log("create ModuleService");
  }

  #moduleFactory = new ModuleFactory();

  get moduleFactory() {
    return this.#moduleFactory;
  }

  getLinks(vuuTable: VuuTable) {
    return this.moduleFactory.getLinks(vuuTable);
  }

  getTablelist() {
    return this.moduleFactory.tableList;
  }

  getTableSchema(vuuTable: VuuTable) {
    return this.moduleFactory.getTableSchema(vuuTable);
  }

  getTable(vuuTable: VuuTable) {
    return this.moduleFactory.getTable(vuuTable);
  }
}

export default ModuleService.instance;
