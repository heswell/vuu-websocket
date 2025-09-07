import { Table } from "@heswell/data";
import { isJoinTableDef, JoinTableDef, TableDef } from "../api/TableDef";
import { vuuInMemPlugin } from "../feature/inmem/VuuInMemPlugin";
import { IProvider } from "../provider/Provider";
import { ProviderContainer } from "../provider/ProviderContainer";
import run from "../server";
import { RealizedViewServerModule, ViewServerModule } from "./module/VsModule";
import { type VuuServerConfig } from "./VuuServerOptions";
import { ViewportContainer } from "../viewport/ViewportContainer";

import { JoinTableProvider } from "../provider/JoinTableProvider";
import { ModuleContainer } from "./module/ModuleContainer";
import { TableContainer } from "./table/TableContainer";
import { CoreServerApiHandler } from "./CoreServerApiHandler";
import { DataTable, isDataTable } from "./table/InMemDataTable";

export class VuuServer {
  protected providerContainer: ProviderContainer;
  public joinProvider: JoinTableProvider;
  public tableContainer: TableContainer;
  public serverApi: CoreServerApiHandler;
  public viewPortContainer: ViewportContainer;
  public moduleContainer: ModuleContainer;

  constructor({ modules, ...config }: VuuServerConfig) {
    this.joinProvider = new JoinTableProvider();
    this.tableContainer = new TableContainer(this.joinProvider);
    this.providerContainer = new ProviderContainer(this.joinProvider);
    this.viewPortContainer = new ViewportContainer(
      this.tableContainer,
      this.providerContainer
    );
    this.moduleContainer = new ModuleContainer();

    modules.forEach(this.registerModule);
    this.serverApi = new CoreServerApiHandler(
      this.viewPortContainer,
      this.tableContainer,
      this.providerContainer
    );
  }

  private createTable(tableDef: TableDef) {
    return vuuInMemPlugin.tableFactory(
      tableDef,
      this.tableContainer,
      this.joinProvider
    );
  }

  private createJoinTable(joinTableDef: JoinTableDef) {
    return vuuInMemPlugin.joinTableFactory(
      joinTableDef,
      this.tableContainer,
      this.joinProvider
    );
  }

  private registerProvider(table: Table, provider: IProvider) {
    this.providerContainer.add(table, provider);
    if (isDataTable(table)) {
      table.provider = provider;
    }
  }

  private registerModule = (module: ViewServerModule) => {
    const vs = this;
    const realizedModule = new (class extends RealizedViewServerModule {
      rpcHandlers = module.rpcHandlersUnrealized.map((rpcFunc) => rpcFunc(vs));
    })({
      name: module.name,
      tableDefs: module.tableDefs,
    });

    this.moduleContainer.register(realizedModule);

    module.tableDefs.forEach((tableDef) => {
      console.log(
        `VuUServer process tabledef for module ${module.name} table ${tableDef.name}`
      );
      tableDef.setModule(module);
      if (isJoinTableDef(tableDef)) {
        const table = this.createJoinTable(tableDef);
        console.log(
          `[VuUServer] what do we do with this joun table we just created`
        );
      } else {
        const table = this.createTable(tableDef);
        const provider = module.getProviderForTable(table);
        this.registerProvider(table, provider);
      }
    });

    module.viewPortDefs.forEach((serviceFactory, tableName) => {
      console.log(`[VuuServer] set serviceFactory for table ${tableName}`);
      this.viewPortContainer.addViewPortDefinition(tableName, serviceFactory);
    });
  };

  startServer() {
    run(this);
  }

  start() {
    console.log("[VuuServer] start");
    this.providerContainer.start(this.tableContainer);
    this.moduleContainer.start();
    this.startServer();
  }
}
