import { TableDefs } from "./ModuleFactory";

// This is created in main class and passed as an implicit parameter in Scala
export class TableDefContainer {
  static #instance: TableDefContainer;
  public static get instance(): TableDefContainer {
    if (!TableDefContainer.#instance) {
      TableDefContainer.#instance = new TableDefContainer();
    }
    return TableDefContainer.#instance;
  }
  private constructor() {
    console.log("create TableDefContainer");
  }

  #tablesByModule = new Map<string, TableDefs>();

  add(module: string, tableDefs: TableDefs) {
    console.log(`TableDefContainer add module ${module}`);
    this.#tablesByModule.set(module, tableDefs);
  }

  get(module: string, tableName: string) {
    const tableDefs = this.#tablesByModule.get(module);
    if (tableDefs) {
      return tableDefs.get(tableName);
    } else {
      throw Error(
        `Module ${module} could not be found in ${Object.keys(
          this.#tablesByModule
        ).join(",")}`
      );
    }
  }
}

export default TableDefContainer.instance;
