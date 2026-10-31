import { Table } from "@heswell/vuu-table";
import { getLogger } from "@heswell/service-utils/browser";
import { isJoinTableDef, JoinTableDef, TableDef } from "../api/TableDef";
import { vuuInMemPlugin } from "../feature/inmem/VuuInMemPlugin";
import { IProvider } from "../provider/Provider";
import { ProviderContainer } from "../provider/ProviderContainer";
import { RealizedViewServerModule, ViewServerModule } from "./module/VsModule";
import { ViewportContainer } from "../viewport/ViewportContainer";
import { JoinTableProvider } from "../provider/JoinTableProvider";
import { ModuleContainer } from "./module/ModuleContainer";
import { TableContainer } from "./table/TableContainer";
import { CoreServerApiHandler } from "./CoreServerApiHandler";
import { isDataTable } from "./table/InMemDataTable";
import {
  type ViewServerHandler,
  type ViewServerHandlerFactory,
  ViewServerHandlerFactoryImpl,
} from "../net/ViewServerHandler";
import {
  ClientSessionContainer,
  type SessionLimitPolicy,
} from "../net/ClientSessionContainer";
import { LifeCycleRunner } from "../toolbox/thread/LifeCycleRunner";
import {
  DefaultLifecycleEnabled,
  LifecycleContainer,
} from "../toolbox/thread/LifecycleContainer";
import { FlowControllerFactory } from "../net/flowcontrol/FlowController";
import type { LoginTokenService } from "../net/auth/LoginTokenService";
import type { LoginSuccessProvider } from "./LoginSuccessProvider";

const log = getLogger("vuu.core");

/** How often queued row updates are sent to each client session. */
const SESSION_RUNNER_INTERVAL_MS = 60;

export interface VuuServerCoreConfig {
  loginTokenService: LoginTokenService;
  loginSuccessProvider?: LoginSuccessProvider;
  modules: ViewServerModule[];
  /** Concurrent sessions allowed per user, default 1. */
  maxSessionsPerUser?: number;
  sessionLimitPolicy?: SessionLimitPolicy;
  /**
   * Send heartbeats and disconnect clients that stop answering them.
   * Default true.
   */
  heartbeat?: boolean;
}

/**
 * The Vuu server without any network transport: tables, providers, modules,
 * viewports, client sessions and the request handlers. It has no Node or Bun
 * dependencies, so it can run in a browser (e.g. a Web Worker).
 *
 * A transport feeds client messages in through a ViewServerHandler, see
 * `createHandler`. `VuuServer` adds the Bun WebSocket and REST servers.
 */
export class VuuServerCore extends DefaultLifecycleEnabled {
  readonly lifecycleId: string = "vuuServer";
  protected providerContainer: ProviderContainer;
  public joinProvider: JoinTableProvider;
  public tableContainer: TableContainer;
  public serverApi: CoreServerApiHandler;
  public viewPortContainer: ViewportContainer;
  public moduleContainer: ModuleContainer;

  protected readonly vuuServerId = crypto.randomUUID();
  protected readonly handlerFactory: ViewServerHandlerFactory;

  get providers() {
    return this.providerContainer;
  }

  constructor(
    {
      heartbeat = true,
      loginSuccessProvider,
      loginTokenService,
      maxSessionsPerUser = 1,
      modules,
      sessionLimitPolicy = "evict-oldest",
    }: VuuServerCoreConfig,
    protected readonly lifecycle: LifecycleContainer,
  ) {
    super();
    const flowControllerFactory = new FlowControllerFactory(heartbeat);

    const sessionContainer = ClientSessionContainer(
      maxSessionsPerUser,
      sessionLimitPolicy,
    );

    this.joinProvider = new JoinTableProvider();

    this.tableContainer = new TableContainer(this.joinProvider);

    this.providerContainer = new ProviderContainer(
      this.joinProvider,
      this.tableContainer,
      lifecycle,
    );

    this.viewPortContainer = new ViewportContainer(
      this.tableContainer,
      this.providerContainer,
    );

    this.moduleContainer = new ModuleContainer();

    modules.forEach(this.registerModule);

    this.serverApi = new CoreServerApiHandler(
      this.viewPortContainer,
      this.tableContainer,
      this.providerContainer,
    );

    this.handlerFactory = new ViewServerHandlerFactoryImpl(
      loginTokenService,
      sessionContainer,
      this.serverApi,
      this.moduleContainer,
      flowControllerFactory,
      this.vuuServerId,
      loginSuccessProvider
        ? (user) => loginSuccessProvider(user, this.tableContainer)
        : undefined,
    );

    lifecycle.apply(this).dependsOn(this.providerContainer);

    const handlerRunner = new LifeCycleRunner(
      "sessionRunner",
      () => sessionContainer.runOnce(),
      SESSION_RUNNER_INTERVAL_MS,
    );
    lifecycle.apply(handlerRunner).dependsOn(this);
  }

  /**
   * A handler that a transport passes client messages and channel closes to.
   * One handler can serve any number of channels.
   */
  createHandler(): ViewServerHandler {
    return this.handlerFactory.create();
  }

  async doStart() {
    await this.moduleContainer.start();
  }

  async doStop() {
    await this.moduleContainer.stop();
  }

  private createTable(tableDef: TableDef) {
    return vuuInMemPlugin.tableFactory(
      tableDef,
      this.tableContainer,
      this.joinProvider,
    );
  }

  private createJoinTable(joinTableDef: JoinTableDef) {
    return vuuInMemPlugin.joinTableFactory(
      joinTableDef,
      this.tableContainer,
      this.joinProvider,
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
      log.debug(
        `process tabledef for module ${module.name} table ${tableDef.name}`,
      );
      tableDef.setModule(module);
      if (isJoinTableDef(tableDef)) {
        this.createJoinTable(tableDef);
        log.debug(`created join table ${tableDef.name}`);
      } else {
        const table = this.createTable(tableDef);
        const provider = module.getProviderForTable(table);
        this.registerProvider(table, provider);
      }
    });

    module.viewPortDefs.forEach((serviceFactory, tableName) => {
      log.debug(`set serviceFactory for table ${tableName}`);
      this.viewPortContainer.addViewPortDefinition(tableName, serviceFactory);
    });
  };
}
