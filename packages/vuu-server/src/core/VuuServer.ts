import { Table } from "@heswell/data";
import { ViewServerModule } from "./module/VsModule";
import { type VuuServerConfig } from "./VuuServerOptions";
import moduleContainer from "./module/ModuleContainer";
import run from "../server";
import { isJoinTableDef, JoinTableDef, TableDef } from "../api/TableDef";
import { IProvider } from "../Provider";
import { ProviderContainer } from "../provider/ProviderContainer";
import tableContainer from "./table/TableContainer";
import { vuuInMemPlugin } from "../feature/inmem/VuuInMemPlugin";
import joinTableProvider from "../provider/JoinTableProvider";

export class VuuServer {
  private providerContainer: ProviderContainer;

  constructor({ modules, ...config }: VuuServerConfig) {
    this.providerContainer = new ProviderContainer();

    modules.forEach(this.registerModule);
  }

  private createTable(moduleName: string, tableDef: TableDef) {
    return vuuInMemPlugin.tableFactory(
      moduleName,
      tableDef,
      tableContainer,
      joinTableProvider
    );
  }

  private createJoinTable(moduleName: string, joinTableDef: JoinTableDef) {
    return vuuInMemPlugin.joinTableFactory(
      moduleName,
      joinTableDef,
      tableContainer,
      joinTableProvider
    );
  }

  private registerProvider(table: Table, provider: IProvider) {
    console.log(`register provider for table ${table.name}`);
    this.providerContainer.add(table, provider);
  }

  private registerModule = (module: ViewServerModule) => {
    // const realizedModule = new RealizedViewServerModule({
    //   name: module.name,
    //   tableDefs: module.tableDefs,
    // });

    moduleContainer.register(module);

    module.tableDefs.forEach((tableDef) => {
      console.log(
        `VuUServer process tabledef for module ${module.name} table ${tableDef.name}`
      );
      tableDef.setModule(module);
      if (isJoinTableDef(tableDef)) {
        const table = this.createJoinTable(module.name, tableDef);
      } else {
        const table = this.createTable(module.name, tableDef);
        const provider = module.getProviderForTable(table);
        this.registerProvider(table, provider);
      }
    });
  };

  start() {
    console.log("[VuuServer] start");
    this.providerContainer.start();
    moduleContainer.start();
    run();
  }
}
