import { Table } from "@heswell/data";
import { IProvider } from "./Provider";
import { VuuLink, VuuTable } from "@vuu-ui/vuu-protocol-types";

export interface ModuleConstructorProps {
  name: string;
}

const loadProviders = (
  providers: IProvider[],
  module: Module,
  loaded: string[] = []
): Promise<string[]> =>
  new Promise(async (resolve, reject) => {
    const isLoaded = (name: string) => loaded.includes(name);
    const unloadedProviders = providers.filter((provider) => !provider.loaded);
    const readyToLoad = unloadedProviders.filter((provider) => {
      return (
        provider.dependencies.length === 0 ||
        provider.dependencies.every(isLoaded)
      );
    });

    const loadingProviders: Array<Promise<void>> = [];
    for (const provider of readyToLoad) {
      loadingProviders.push(provider.load(module));
    }
    await Promise.all(loadingProviders);
    loaded = loaded.concat(readyToLoad.map(({ table }) => table.name));
    if (loaded.length === providers.length) {
      resolve(loaded);
    } else {
      return loadProviders(providers, module, loaded);
    }
  });

export class Module {
  #name: string;
  #providers = new Map<string, IProvider>();
  #links = new Map<string, VuuLink[]>();
  #tables = new Map<string, Table>();

  constructor({ name }: ModuleConstructorProps) {
    this.#name = name;
    console.log(`create Module ${name}`);
  }

  get name() {
    return this.#name;
  }

  addTable(table: Table, provider: IProvider) {
    const { table: tableName } = table.schema.table;
    if (this.#tables.has(tableName)) {
      throw Error(
        `[${this.name}] table ${table.schema.table} has already been created`
      );
    }
    this.#providers.set(tableName, provider);
    this.#tables.set(tableName, table);
    return table;
  }

  addLinks(table: Table, links: VuuLink[]) {
    this.#links.set(table.name, links);
  }

  async start() {
    let providers = Array.from(this.#providers.values());

    await loadProviders(providers, this);

    console.log(`[${this.name}] all tables loaded`);
  }

  getTableList() {
    return Array.from(this.#tables.values())
      .map(({ schema }) => schema.table)
      .filter(({ session }) => session === undefined)
      .map<VuuTable>(({ session, ...table }) => table);
  }

  getTableSchema(tableName: string) {
    return this.getTable(tableName).schema;
  }

  getTable(tableName: string) {
    const table = this.#tables.get(tableName);
    if (table) {
      return table;
    } else throw Error(`[${this.name}] no table found ${tableName}`);
  }

  getLinks(tableName: string) {
    return this.#links.get(tableName);
  }
}
