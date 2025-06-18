import { Table } from "@heswell/data";
import { ViewServerModule } from "./module/VsModule";
import { type VuuServerConfig } from "./VuuServerOptions";
import moduleContainer from "./module/ModuleContainer";
import run from "../server";
import { TableDef } from "../api/TableDef";
import { tableDefToSchema } from "../tableDefToSchema";
import { IProvider } from "../Provider";
import { ProviderContainer } from "../provider/ProviderContainer";
import tableContainer from "./table/TableContainer";

export class VuuServer {
  private providerContainer: ProviderContainer;

  constructor({ modules, ...config }: VuuServerConfig) {
    this.providerContainer = new ProviderContainer();

    modules.forEach(this.registerModule);
  }

  private createTable(moduleName: string, tableDef: TableDef) {
    const table = new Table({
      schema: tableDefToSchema(moduleName, tableDef),
    });
    tableContainer.add(table);
    return table;
  }

  private registerProvider(table: Table, provider: IProvider) {
    console.log(`register provider for table ${table.name}`);
    this.providerContainer.add(table, provider);
  }

  private registerModule = (module: ViewServerModule) => {
    console.log(`register Module ${module.name}`, {
      module,
    });

    // const realizedModule = new RealizedViewServerModule({
    //   name: module.name,
    //   tableDefs: module.tableDefs,
    // });

    moduleContainer.register(module);

    module.tableDefs.forEach((tableDef) => {
      tableDef.setModule(module);
      const table = this.createTable(module.name, tableDef);
      console.log(`Loading provider for table ${table.name}...`);
      const provider = module.getProviderForTable(table, this);
      this.registerProvider(table, provider);
    });
  };

  start() {
    console.log("[VuuServer] start");
    this.providerContainer.start();
    moduleContainer.start();
    run();
  }
}
