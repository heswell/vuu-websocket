import type {
  DataSourceBase,
  DataSourceConfig,
  DataSourceRowWithBigint,
  DataSourceSubscribedMessage,
  DataSourceVisualLinkCreatedMessage,
  DeleteRowMode,
  EditSessionMode,
  CopyOption,
  SessionDataSourceOverrides,
  SessionType,
  TableSchema,
} from "@vuu-ui/vuu-data-types";
import type {
  VuuMenu,
  VuuRowDataItemType,
  VuuLink,
  LinkDescriptorWithLabel,
  VuuRpcMenuResponse,
  VuuCreateVisualLink,
  VuuRemoveVisualLink,
  VuuRpcServiceRequest,
  RpcResultSuccess,
  RpcResultError,
  VuuRpcMenuRequest,
  VuuTable,
  VuuDataRow,
  RpcResult,
} from "@vuu-ui/vuu-protocol-types";
import {
  isAddRowRpcRequest,
  isBeginEditSessionRpcRequest,
  isCreateSessionTableRpcRequest,
  isDeleteSelectedRowsRpcRequest,
  isEditCellRpcRequest,
  isEndEditSessionRpcRequest,
  isRpcSuccess,
  isUndoRowChangeRpcRequest,
  uuid,
} from "@vuu-ui/vuu-utils";
import {
  Table,
  type TableRow,
  buildDataColumnMapFromSchema,
} from "../../Table";
import { ModuleDataSource } from "../../ModuleDataSource";
import { RuntimeVisualLink } from "../../RuntimeVisualLink";
import { sessionTableRow, sessionTableSchema } from "../../session-table-utils";
import {
  AllowAllPermissionFilter,
  type PermissionFunction,
  type RowPredicate,
} from "../filter/PermissionFilter";
import { getCurrentUser, type VuuModuleUser } from "../user/CurrentUser";
import { TableContainer } from "../table/TableContainer";
import type { LocalEngine } from "../engine/LocalEngine";
import {
  type CanSaveSessionResult,
  type CellEdit,
  type EditContext,
  type EditHooks,
  type PreparedSessionChange,
  type PreparedSessionSave,
  type SessionRowChange,
  type SessionSaveResult,
  type SessionTableAction,
  DUPLICATE_KEY,
  SAVE_FAILED,
  SAVE_NOT_PERMITTED,
  STALE_UPDATE,
  defaultApplySessionSave,
  defaultCanEditSource,
  defaultGetStaleColumns,
  defaultIsEditableColumn,
  isSystemColumn,
} from "./edit-hooks";

const errorResult = (errorMessage: string): RpcResultError => ({
  type: "ERROR_RESULT",
  errorMessage,
});

const messageOf = (error: unknown, defaultMessage = SAVE_FAILED) =>
  (error instanceof Error ? error.message : String(error ?? "")) ||
  defaultMessage;

const isPromise = <V>(value: unknown): value is Promise<V> =>
  typeof (value as Promise<V>)?.then === "function";

const SESSION_ACTIONS: ReadonlySet<string> = new Set<SessionTableAction>([
  "addRow",
  "deleteRow",
  "editCell",
]);

const assertUpdateIsValid = (
  schema: TableSchema,
  column: string,
  _data: VuuRowDataItemType,
) => {
  const col = schema.columns.find((col) => col.name === column);
  if (col) {
    // switch (col.serverDataType){
    // }
  } else {
    throw Error(
      `schema for table ${schema.table.table} does not include column ${column}`,
    );
  }
};

export interface IVuuModule<T extends string = string> {
  createDataSource: (
    tableName: T,
    viewport?: string,
    config?: DataSourceConfig & { session?: SessionDataSourceOverrides },
  ) => DataSourceBase<DataSourceRowWithBigint>;
}

export type SessionTableMap = Record<string, Table>;

export type ServiceHandler = (
  rpcRequest: VuuRpcServiceRequest,
) => Promise<RpcResultSuccess | RpcResultError>;

export type MenuServiceHandler = (
  rpcRequest: VuuRpcMenuRequest,
) => Promise<VuuRpcMenuResponse>;

export type RpcService = {
  rpcName: string;
  service: ServiceHandler;
};

export type RpcMenuService = {
  rpcName: string;
  service: MenuServiceHandler;
};

export type VuuModuleOptions = {
  /** Column written by session services (deleteRow, endEditSession) to report row-level status.
   *  Defaults to `"vuuMsg"` which matches the column added by `sessionTableSchema`. */
  sessionTableMessageColumn?: string;
};

type Subscription = {
  viewportId: string;
  dataSource: DataSourceBase<DataSourceRowWithBigint>;
  sessionTableName?: string;
  sourceTableName?: string;
  /**
   * The table viewed by this subscription. Row permissions are applied
   * by the dataSource engine, not by the table.
   */
  table: Table;
  user: VuuModuleUser;
};
export abstract class VuuModule<
  T extends string = string,
> implements IVuuModule<T> {
  #name: string;
  #sessionTableMessageColumn: string;
  #runtimeVisualLinks = new Map<string, RuntimeVisualLink>();
  #sessionSourceTableMap: Record<string, T> = {};
  #sessionTableMap: SessionTableMap = {};
  /** Per session table, copies of source rows taken when copied into the session. */
  #sessionSnapshots = new Map<string, Map<string, TableRow>>();
  /** Per session table, keys of rows whose message was set by a failed save. */
  #sessionMessageKeys = new Map<string, Set<string>>();
  #subscriptionMap: Map<string, Subscription[]> = new Map();
  #engine: LocalEngine | undefined;
  #ownTableContainer: TableContainer | undefined;

  /**
   * Modules are not registered anywhere on construction. Register them with
   * a LocalEngine (`createLocalEngine({ modules })`).
   */
  constructor(
    name: string,
    { sessionTableMessageColumn = "vuuMsg" }: VuuModuleOptions = {},
  ) {
    this.#name = name;
    this.#sessionTableMessageColumn = sessionTableMessageColumn;
  }

  /** The engine this module was first registered with, if any. */
  get engine() {
    return this.#engine;
  }

  /** @internal called by LocalEngine.register */
  attachEngine(engine: LocalEngine) {
    if (this.#engine === undefined) {
      this.#engine = engine;
    }
  }

  /** @internal called by LocalEngine.unregister */
  detachEngine(engine: LocalEngine) {
    if (this.#engine === engine) {
      this.#engine = undefined;
    }
  }

  /**
   * Release resources (timers, providers). Called by `LocalEngine.dispose`
   * for modules it owns. Subclasses that start timers should override,
   * calling super.dispose().
   */
  dispose() {
    this.#sessionTableMap = {};
    this.#sessionSourceTableMap = {};
    this.#sessionSnapshots.clear();
    this.#sessionMessageKeys.clear();
  }

  protected abstract menus?: Record<T, VuuMenu | undefined> | undefined;
  protected abstract schemas: Record<T, Readonly<TableSchema>>;
  protected abstract tables: Record<T, Table>;
  protected abstract menuServices?:
    Record<T, RpcMenuService[] | undefined> | undefined;
  /**
   * Per table services. A service with the same rpcName as a built-in
   * service (e.g. endEditSession, editCell) replaces it for that table,
   * including for edit sessions created from the table.
   */
  protected abstract services?: Record<T, RpcService[] | undefined> | undefined;
  /**
   * Services available on every table of this module. Like table services,
   * these replace built-in services with the same rpcName. Table services
   * take precedence.
   */
  protected moduleServices?: RpcService[];
  /**
   * Per table edit hooks. These take precedence over the module-wide
   * protected hook methods (isEditableColumn, validateCellEdit,
   * getStaleColumns, canSaveSession, applySessionSave, canEditSource).
   */
  protected editHooks?: Partial<Record<T, EditHooks>>;
  protected abstract visualLinks?: Record<T, VuuLink[] | undefined>;
  protected get includeDefaultServices() {
    return true;
  }
  /**
   * Called on save, before changes are prepared. Rows given a message
   * (vuuMsg) here are treated as handled and excluded from the save.
   * @deprecated implement applySessionSave (per table via editHooks).
   */
  protected async beforeSessionSave(
    _sourceTable: Table,
    _sessionTable: Table,
  ) {}
  /** Called after a successful save, before the session is reset. */
  protected async afterSessionSave(_sourceTable: Table, _sessionTable: Table) {}

  /** See {@link EditHooks.canEditSource}. Default true. */
  protected canEditSource(_column: string, _ctx: EditContext): boolean {
    return defaultCanEditSource();
  }
  /** See {@link EditHooks.isEditableColumn}. */
  protected isEditableColumn(
    table: Table,
    column: string,
    _ctx: EditContext,
  ): boolean {
    return defaultIsEditableColumn(table, column);
  }
  /** See {@link EditHooks.validateCellEdit}. */
  protected validateCellEdit(_edit: CellEdit): string | undefined | void {
    return undefined;
  }
  /** See {@link EditHooks.getStaleColumns}. */
  protected getStaleColumns(
    sourceTable: Table,
    sourceRow: TableRow,
    change: SessionRowChange,
  ): string[] {
    return defaultGetStaleColumns(sourceTable, sourceRow, change);
  }
  /** See {@link EditHooks.canSaveSession}. Default true. */
  protected canSaveSession(
    _prepared: PreparedSessionSave,
    _ctx: EditContext,
  ): CanSaveSessionResult | Promise<CanSaveSessionResult> {
    return true;
  }
  /** See {@link EditHooks.applySessionSave}. */
  protected applySessionSave(
    sessionTable: Table,
    prepared: PreparedSessionSave,
    _ctx: EditContext,
  ): SessionSaveResult | Promise<SessionSaveResult> {
    return defaultApplySessionSave(sessionTable, prepared);
  }

  #hooksFor(tableName: string): Required<EditHooks> {
    const tableHooks = this.editHooks?.[tableName as T] ?? {};
    return {
      canEditSource:
        tableHooks.canEditSource ?? ((...args) => this.canEditSource(...args)),
      isEditableColumn:
        tableHooks.isEditableColumn ??
        ((...args) => this.isEditableColumn(...args)),
      validateCellEdit:
        tableHooks.validateCellEdit ??
        ((...args) => this.validateCellEdit(...args)),
      getStaleColumns:
        tableHooks.getStaleColumns ??
        ((...args) => this.getStaleColumns(...args)),
      canSaveSession:
        tableHooks.canSaveSession ??
        ((...args) => this.canSaveSession(...args)),
      applySessionSave:
        tableHooks.applySessionSave ??
        ((...args) => this.applySessionSave(...args)),
    };
  }
  /**
   * Optional, per table. Restricts the rows visible to each viewport, based on
   * the viewport (and the user who owns it).
   */
  protected permissionFunctions?: Partial<Record<T, PermissionFunction>>;

  /**
   * Invoked before a dataSource is created. Can be used, for example, to
   * lazily start a data provider.
   */
  protected beforeCreateDataSource?(tableName: T): void;

  getTableSchema(tableName: string) {
    return (
      this.schemas[tableName as T] ?? this.#sessionTableMap[tableName]?.schema
    );
  }

  getTableList() {
    return Object.keys(this.tables);
  }

  /** The tables published by this module, keyed by table name. */
  getTables(): Record<T, Table> {
    return this.tables;
  }

  getTable(tableName: T): Table {
    const table = this.tables[tableName];
    if (table) {
      return table;
    }
    throw Error(`[VuuModule] module ${this.#name} has no table ${tableName}`);
  }

  /**
   * Tables visible to permission functions: the engine's tables, or this
   * module's own tables if it is not registered with an engine.
   */
  protected get tableContainer(): TableContainer {
    if (this.#engine) {
      return this.#engine.tableContainer;
    }
    if (this.#ownTableContainer === undefined) {
      this.#ownTableContainer = new TableContainer();
      for (const [tableName, table] of Object.entries<Table>(this.tables)) {
        this.#ownTableContainer.addTable(table, {
          module: this.#name,
          table: tableName,
        });
      }
    }
    return this.#ownTableContainer;
  }

  protected handlePostSubscribeActivities = ({
    clientViewportId,
    tableSchema,
  }: DataSourceSubscribedMessage) => {
    const visualLinks = this.getVisualLinks(tableSchema.table.table);
    const { dataSource } = this.getSubscriptionByViewport(clientViewportId);
    requestAnimationFrame(() => {
      dataSource.links = visualLinks;
    });

    // check whether newly subscribed viewport is associated with table that is a potential
    // visual link target. If so send links update message to any active subscription
    // associated with a table that is a potential link source
    if (this.visualLinks && dataSource.tableSchema) {
      const {
        table: { table: sourceTable },
      } = dataSource.tableSchema;
      for (const [table, links] of Object.entries<VuuLink[] | undefined>(
        this.visualLinks,
      )) {
        if (links) {
          const potentialTargets = links.filter(
            (l) => l.toTable === sourceTable,
          );
          if (potentialTargets.length) {
            for (const subscriptions of this.#subscriptionMap.values()) {
              for (const { dataSource } of subscriptions) {
                if (dataSource.tableSchema?.table.table === table) {
                  dataSource.links = this.getVisualLinks(table);
                }
              }
            }
          }
        }
      }
    }
  };

  protected unregisterViewport = (viewportId: string) => {
    const { dataSource } = this.getSubscriptionByViewport(viewportId);
    const tableName = dataSource.tableSchema?.table.table;
    if (tableName) {
      const subscriptionsForTable = this.#subscriptionMap.get(tableName);
      if (subscriptionsForTable) {
        for (const { viewportId: vp } of subscriptionsForTable) {
          if (vp === viewportId) {
            if (subscriptionsForTable.length === 1) {
              this.#subscriptionMap.delete(tableName);
            } else {
              this.#subscriptionMap.set(
                tableName,
                subscriptionsForTable.filter(
                  (s) => s.viewportId !== viewportId,
                ),
              );
            }
          }
        }
      }
    }

    for (const [tableName, subscriptions] of this.#subscriptionMap) {
      if (subscriptions[0].viewportId.toString() === viewportId) {
        this.#subscriptionMap.delete(tableName);
      }
    }

    // check whether newly unsubscribed viewport is associated with table that is a potential
    // visual link target. If so send links update message to any active subscription
    // associated with a table that is a potential link source
    if (this.visualLinks && dataSource.tableSchema) {
      const {
        table: { table: sourceTable },
      } = dataSource.tableSchema;
      for (const [table, links] of Object.entries<VuuLink[] | undefined>(
        this.visualLinks,
      )) {
        if (links) {
          const potentialTargets = links.filter(
            (l) => l.toTable === sourceTable,
          );
          if (potentialTargets.length) {
            for (const subscriptions of this.#subscriptionMap.values()) {
              for (const { dataSource } of subscriptions) {
                if (dataSource.tableSchema?.table.table === table) {
                  dataSource.links = this.getVisualLinks(table);
                }
              }
            }
          }
        }
      }
    }
  };

  get name() {
    return this.#name;
  }

  getSubscriptionByViewport(viewportId: string) {
    for (const subscriptions of this.#subscriptionMap.values()) {
      for (const subscription of subscriptions) {
        if (subscription.viewportId === viewportId) {
          return subscription;
        }
      }
    }
    throw Error(
      `[VuuModule] getSubscriptionByViewport, no subscription found for ${viewportId}`,
    );
  }

  getSubscribedDataSource(vpId: string): ModuleDataSource {
    for (const subscriptions of this.#subscriptionMap.values()) {
      for (const { viewportId, dataSource } of subscriptions) {
        if (viewportId === vpId) {
          return dataSource as ModuleDataSource;
        }
      }
    }
    throw Error(`getSubscribedDataSource #${vpId} not in subscriptionMap`);
  }

  getLinks = (
    subscriptionMap: Map<string, Subscription[]>,
    vuuLinks: VuuLink[],
  ) => {
    const visualLinks: LinkDescriptorWithLabel[] = [];
    for (let i = 0; i < vuuLinks.length; i++) {
      const subscriptions = subscriptionMap.get(vuuLinks[i].toTable);
      if (subscriptions) {
        subscriptions.forEach(({ viewportId, dataSource: { status } }) => {
          if (status !== "suspended") {
            const newLink: LinkDescriptorWithLabel = {
              parentClientVpId: viewportId,
              parentVpId: viewportId,
              link: vuuLinks[i],
            };
            visualLinks.push(newLink);
          }
        });
      }
    }
    return visualLinks;
  };

  visualLinkService = (
    message: VuuCreateVisualLink | VuuRemoveVisualLink,
  ): Promise<DataSourceVisualLinkCreatedMessage | undefined> =>
    new Promise((resolve) => {
      if (message.type === "CREATE_VISUAL_LINK") {
        const { childColumnName, childVpId, parentColumnName, parentVpId } =
          message;
        const childDataSource = this.getSubscribedDataSource(childVpId);
        const parentDataSource = this.getSubscribedDataSource(parentVpId);
        const runtimeVisualLink = new RuntimeVisualLink(
          childDataSource,
          parentDataSource,
          childColumnName,
          parentColumnName,
        );

        this.#runtimeVisualLinks.set(childVpId, runtimeVisualLink);

        resolve({
          clientViewportId: childVpId,
          colName: childColumnName,
          parentColName: parentColumnName,
          parentViewportId: parentVpId,
          type: "vuu-link-created",
        } as DataSourceVisualLinkCreatedMessage);
      } else {
        const runtimeVisualLink = this.#runtimeVisualLinks.get(
          message.childVpId,
        );
        if (runtimeVisualLink) {
          runtimeVisualLink.remove();
          this.#runtimeVisualLinks.delete(message.childVpId);
        } else {
          throw Error(
            `visualLinkService no visual link found for viewport #${message.childVpId}`,
          );
        }
        resolve(undefined);
      }
    });

  getVisualLinks = (tableName: string) => {
    const linksForTable = this.visualLinks?.[tableName as T] as VuuLink[];
    return linksForTable === undefined
      ? undefined
      : this.getLinks(this.#subscriptionMap, linksForTable);
  };

  createDataSource = (
    tableName: T,
    viewport?: string,
    config?: DataSourceConfig & { session?: SessionDataSourceOverrides },
  ) => {
    this.beforeCreateDataSource?.(tableName);
    const columnDescriptors = this.getColumnDescriptors(tableName);
    const sessionTable = this.#sessionTableMap[tableName];
    const user = getCurrentUser();
    const permissionFunction = sessionTable
      ? undefined
      : this.permissionFunctions?.[tableName];
    const viewportId = permissionFunction ? (viewport ?? uuid()) : viewport;
    const table = this.tables[tableName];
    const permissionFilter = permissionFunction
      ? this.createPermissionPredicate(table, permissionFunction, {
          id: viewportId as string,
          user,
        })
      : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vuuModule = this as IVuuModule<any>;

    const dataSource: DataSourceBase<DataSourceRowWithBigint> =
      new ModuleDataSource({
        ...config,
        columnDescriptors,
        getVisualLinks: this.getVisualLinks,
        keyColumn:
          this.schemas[tableName] === undefined
            ? this.#sessionTableMap[tableName].schema.key
            : this.schemas[tableName].key,
        table: table || sessionTable,
        menu: this.menus?.[tableName],
        permissionFilter,
        rpcServices: this.getServices(tableName),
        rpcMenuServices: this.getMenuServices(tableName),
        viewport: viewportId,
        visualLinkService: this.visualLinkService,
        vuuModule,
      });

    dataSource.on("subscribed", this.handlePostSubscribeActivities);
    dataSource.on("unsubscribed", this.unregisterViewport);

    const existingSubscriptions = this.#subscriptionMap.get(tableName);
    const subscription = {
      viewportId: dataSource.viewport as string,
      dataSource,
      sessionTableName: sessionTable ? tableName : undefined,
      sourceTableName: this.#sessionSourceTableMap[tableName],
      table: table || sessionTable,
      user,
    };
    if (existingSubscriptions) {
      existingSubscriptions.push(subscription);
    } else {
      this.#subscriptionMap.set(tableName, [subscription]);
    }

    return dataSource;
  };

  private createPermissionPredicate(
    table: Table,
    permissionFunction: PermissionFunction,
    viewport: { id: string; user: VuuModuleUser },
  ): RowPredicate | undefined {
    const permissionFilter = permissionFunction(viewport, this.tableContainer);
    if (permissionFilter === AllowAllPermissionFilter) {
      return undefined;
    }
    return permissionFilter.createPredicate(table.map);
  }

  /**
   * The RPC services for a table: built-in services, overridden by
   * moduleServices, overridden by table services (matched by rpcName).
   * For a session table, the services of its source table.
   */
  getServices(tableName: T): RpcService[] {
    const sourceTableName = this.#sessionSourceTableMap[tableName] ?? tableName;
    const defaultServices = this.includeDefaultServices
      ? this.#defaultServices
      : [];
    return mergeServices(
      defaultServices,
      this.moduleServices,
      this.services?.[sourceTableName],
    );
  }

  getMenuServices(tableName: T): RpcMenuService[] {
    const sourceTableName = this.#sessionSourceTableMap[tableName] ?? tableName;
    return mergeServices(
      this.#moduleMenuServices,
      this.menuServices?.[sourceTableName],
    );
  }

  protected get sessionTableMap() {
    return this.#sessionTableMap;
  }

  protected getSessionTable(sessionTableName: string): Table;
  protected getSessionTable(
    sessionTableName: string,
    throwIfNotFound: true,
  ): Table;
  protected getSessionTable(
    sessionTableName: string,
    throwIfNotFound: false,
  ): Table | undefined;
  protected getSessionTable(sessionTableName: string, throwIfNotFound = true) {
    const sessionTable = this.#sessionTableMap[sessionTableName];
    if (sessionTable) {
      return sessionTable;
    } else if (throwIfNotFound) {
      throw Error(
        `getSessionTable: no session table with name ${sessionTableName}`,
      );
    }
  }

  protected deleteRow: ServiceHandler = async (rpcRequest) => {
    if (rpcRequest.context.type === "VIEWPORT_CONTEXT") {
      const { viewPortId } = rpcRequest.context;
      const { key, mode = "hard" } = rpcRequest.params as {
        key: string;
        mode?: "soft" | "hard";
      };
      const sessionTable = this.getSessionTable(viewPortId, false);
      if (sessionTable) {
        if (mode === "soft") {
          sessionTable.update(key, "vuuAction", "deleteRow");
        } else {
          sessionTable.delete(key);
        }
        return { type: "SUCCESS_RESULT", data: undefined };
      } else {
        const { dataSource } = this.getSubscriptionByViewport(viewPortId);
        if (dataSource.table) {
          const table = this.tables[dataSource.table.table as T];
          if (table) {
            if (mode === "soft") {
              table.update(
                key,
                this.#sessionTableMessageColumn,
                "SOFT_DELETED",
              );
            } else {
              table.delete(key);
            }
            return { type: "SUCCESS_RESULT", data: undefined };
          }
        }
      }
    }
    return { type: "ERROR_RESULT", errorMessage: "something went wrong" };
  };

  private deleteSelectedRows: ServiceHandler = async (rpcRequest) => {
    if (isDeleteSelectedRowsRpcRequest(rpcRequest)) {
      const { viewPortId } = rpcRequest.context;
      const { mode = "soft" } = rpcRequest.params;
      const sessionTable = this.getSessionTable(viewPortId, false);
      if (sessionTable) {
        const { dataSource } = this.getSubscriptionByViewport(viewPortId);
        const selectedRowIds = (
          dataSource as ModuleDataSource
        ).getSelectedRowIds();
        if (selectedRowIds.length > 0) {
          for (const key of selectedRowIds) {
            if ((mode as DeleteRowMode) === "soft") {
              sessionTable.update(key, "vuuAction", "deleteRow");
            } else {
              sessionTable.delete(key);
            }
          }
          dataSource.select?.({ type: "DESELECT_ALL" });
        }
        return {
          type: "SUCCESS_RESULT",
          data: { deletedKeys: selectedRowIds },
        };
      }
      return {
        type: "ERROR_RESULT",
        errorMessage: `deleteSelectedRows: no active session table for viewport ${viewPortId}`,
      };
    }
    return {
      type: "ERROR_RESULT",
      errorMessage: "deleteSelectedRows: invalid rpc request",
    };
  };

  private undoRowChange: ServiceHandler = async (rpcRequest) => {
    if (isUndoRowChangeRpcRequest(rpcRequest)) {
      const { viewPortId } = rpcRequest.context;
      const { key } = rpcRequest.params;
      const sessionTable = this.getSessionTable(viewPortId, false);
      if (sessionTable) {
        const subscription = this.getSubscriptionByViewport(viewPortId);
        const { dataSource } = subscription;
        const sourceTableName =
          subscription.sourceTableName ?? dataSource.table?.table;
        const sourceTable = this.tables[sourceTableName as T];
        if (!sourceTable) {
          return {
            type: "ERROR_RESULT",
            errorMessage: `undoRowChange: source table not found for viewport ${viewPortId}`,
          };
        }
        const sessionRow = sessionTable.findByKey(key);
        if (!sessionRow) {
          return {
            type: "ERROR_RESULT",
            errorMessage: `undoRowChange: session row not found for key ${key}`,
          };
        }
        const action = sessionRow[sessionTable.map.vuuAction];
        if (action === "addRow") {
          sessionTable.delete(key);
          return { type: "SUCCESS_RESULT", data: { wasInsertedRow: true } };
        }
        if (action === "deleteRow" || action === "editCell") {
          const sourceRow = sourceTable.findByKey(key);
          if (!sourceRow) {
            return {
              type: "ERROR_RESULT",
              errorMessage: `undoRowChange: source row not found for key ${key}`,
            };
          }
          const restoredRow = sessionRow.slice();
          for (const column of sourceTable.schema.columns) {
            restoredRow[sessionTable.map[column.name]] =
              sourceRow[sourceTable.map[column.name]];
          }
          sessionTable.updateRow(restoredRow);
          sessionTable.update(key, "vuuAction", "");
          this.#sessionSnapshots.get(viewPortId)?.set(key, sourceRow.slice());
        }
        return { type: "SUCCESS_RESULT", data: undefined };
      }
      return {
        type: "ERROR_RESULT",
        errorMessage: `undoRowChange: no active session table for viewport ${viewPortId}`,
      };
    }
    return {
      type: "ERROR_RESULT",
      errorMessage: "undoRowChange: invalid rpc request",
    };
  };

  private getColumnDescriptors(tableName: T) {
    const schema =
      this.schemas[tableName] || this.getSessionTable(tableName)?.schema;
    if (schema) {
      return schema.columns;
    } else {
      throw Error(
        ` no schema found for module ${this.#name} table ${tableName}`,
      );
    }
  }

  #editContext(
    viewportId: string,
    tableName: string,
    sessionTableName?: string,
  ): EditContext {
    let user: VuuModuleUser;
    try {
      user = this.getSubscriptionByViewport(viewportId).user;
    } catch {
      user = getCurrentUser();
    }
    return {
      moduleName: this.#name,
      tableName,
      viewportId,
      user,
      sessionTable: sessionTableName
        ? this.#sessionTableMap[sessionTableName]
        : undefined,
      sessionTableName,
    };
  }

  private editCell: ServiceHandler = async (rpcRequest) => {
    if (isEditCellRpcRequest(rpcRequest)) {
      const { viewPortId } = rpcRequest.context;
      const { column, data, key } = rpcRequest.params as {
        column: string;
        data: VuuRowDataItemType;
        key: string;
      };
      const sessionTable = this.#sessionTableMap[viewPortId];
      let targetTable: Table | undefined = sessionTable;
      let sourceTableName: string | undefined =
        this.#sessionSourceTableMap[viewPortId];
      if (!targetTable) {
        const { dataSource } = this.getSubscriptionByViewport(viewPortId);
        if (dataSource.table) {
          sourceTableName = dataSource.table.table;
          targetTable = this.tables[sourceTableName as T];
        }
      }
      if (targetTable && sourceTableName) {
        try {
          const hooks = this.#hooksFor(sourceTableName);
          const ctx = this.#editContext(
            viewPortId,
            sourceTableName,
            sessionTable ? viewPortId : undefined,
          );
          if (!sessionTable && !hooks.canEditSource(column, ctx)) {
            throw Error(
              `editCell: table ${sourceTableName} can only be edited in an edit session`,
            );
          }
          const row = targetTable.findByKey(key);
          if (!row) {
            throw Error(`editCell: row not found for key ${key}`);
          }
          const action = sessionTable
            ? row[sessionTable.map.vuuAction]
            : undefined;
          if (action === "deleteRow") {
            throw Error("editCell: cannot edit a deleted row");
          }
          const isNewRowKey =
            action === "addRow" && column === targetTable.schema.key;
          if (
            !isNewRowKey &&
            !hooks.isEditableColumn(targetTable, column, ctx)
          ) {
            throw Error(`editCell: column ${column} is not editable`);
          }
          assertUpdateIsValid(targetTable.schema, column, data);
          const newRow = row.slice();
          newRow[targetTable.map[column]] = data;
          const validationError = hooks.validateCellEdit({
            column,
            ctx,
            dataType: targetTable.schema.columns.find(
              ({ name }) => name === column,
            )?.serverDataType,
            key,
            newRow,
            row,
            table: targetTable,
            value: data,
          });
          if (typeof validationError === "string" && validationError) {
            throw Error(validationError);
          }
          targetTable.update(key, column, data);
          if (sessionTable && action !== "addRow") {
            sessionTable.update(key, "vuuAction", "editCell");
          }
          return {
            type: "SUCCESS_RESULT",
            data: undefined,
          };
        } catch (e) {
          const { message } = e as Error;
          return {
            type: "ERROR_RESULT",
            errorMessage: message,
          };
        }
      } else {
        throw Error("[VuuModule] editCell unable to find table for dataSource");
      }
    } else {
      throw Error("[VuuModule] editCell invalid rpc type");
    }
  };

  private beginEditSessionMenuHandler: MenuServiceHandler = async ({
    rpcName,
    type,
    vpId,
  }) => {
    if (type === "VIEW_PORT_MENUS_SELECT_RPC") {
      const result = await this.beginEditSession({
        context: {
          type: "VIEWPORT_CONTEXT",
          viewPortId: vpId,
        },
        params: {
          editSessionMode: "selected-rows",
        },
        rpcName,
        type: "RPC_REQUEST",
      });
      if (isRpcSuccess(result)) {
        const { table } = result.data as { table: VuuTable };
        return {
          type: "VIEW_PORT_MENU_RESP",
          rpcName,
          action: {
            renderComponent: "grid",
            type: "OPEN_DIALOG_ACTION",
            table,
          },
          vpId,
        };
      } else {
        return {
          error: result.errorMessage,
          rpcName,
          type: "VIEW_PORT_MENU_REJ",
          vpId,
        };
      }
    } else {
      return {
        error: "no can do",
        rpcName,
        type: "VIEW_PORT_MENU_REJ",
        vpId,
      };
    }
  };

  /**
   * Creates a standalone session table.
   * The `copyOption` determines which rows are copied into the session table.
   * Returns the session table reference so the caller can subscribe to it.
   */
  private createSessionTableService: ServiceHandler = async (rpcRequest) => {
    if (isCreateSessionTableRpcRequest(rpcRequest)) {
      const { viewPortId } = rpcRequest.context;
      const { copyOption, sessionType } = rpcRequest.params;
      const subscription = this.getSubscriptionByViewport(viewPortId);
      const { dataSource } = subscription;
      const { table: vuuTable } = dataSource;
      if (vuuTable) {
        const sourceTable = this.tables[vuuTable.table as T];
        if (sourceTable) {
          const sessionTableName = `session-${uuid()}`;
          try {
            const sessionTable = this.createSessionTable(
              sourceTable,
              sessionTableName,
              copyOption,
              dataSource as ModuleDataSource,
              sessionType,
            );
            this.#registerSession(
              sessionTableName,
              sessionTable,
              sourceTable,
              vuuTable.table as T,
            );
            subscription.sessionTableName = sessionTableName;
            return {
              data: {
                table: { module: vuuTable.module, table: sessionTableName },
              },
              type: "SUCCESS_RESULT",
            };
          } catch (e) {
            return {
              type: "ERROR_RESULT",
              errorMessage: (e as Error).message,
            };
          }
        }
      }
    }
    return {
      type: "ERROR_RESULT",
      errorMessage: "createSessionTable: invalid rpc request",
    };
  };

  private beginEditSession: ServiceHandler = async (rpcRequest) => {
    if (isBeginEditSessionRpcRequest(rpcRequest)) {
      const { viewPortId } = rpcRequest.context;
      const { editSessionMode = "inline-all-rows" } = rpcRequest.params;
      const subscription = this.getSubscriptionByViewport(viewPortId);
      const { dataSource } = subscription;
      const { table: vuuTable } = dataSource;
      if (vuuTable) {
        const sourceTable = this.tables[vuuTable.table as T];
        if (sourceTable) {
          const sessionTableName = `session-${uuid()}`;
          try {
            const sessionTable = this.createSessionTable(
              sourceTable,
              sessionTableName,
              editSessionMode as EditSessionMode,
              dataSource as ModuleDataSource,
            );
            this.#registerSession(
              sessionTableName,
              sessionTable,
              sourceTable,
              vuuTable.table as T,
            );
            subscription.sessionTableName = sessionTableName;

            return {
              data: {
                renderComponent: "inline-form",
                table: {
                  module: vuuTable.module,
                  table: sessionTableName,
                },
              },
              type: "SUCCESS_RESULT",
            };
          } catch (e) {
            return {
              type: "ERROR_RESULT",
              errorMessage: (e as Error).message,
            };
          }
        }
      }
    } else {
      throw Error("[VuuModule] endEditSession invalid rpc type");
    }

    return {
      type: "ERROR_RESULT",
      errorMessage: "not implemented yet",
    };
  };

  private addRow: ServiceHandler = async (rpcRequest) => {
    if (isAddRowRpcRequest(rpcRequest)) {
      const { viewPortId } = rpcRequest.context;
      const subscription = this.getSubscriptionByViewport(viewPortId);
      const sessionTableName = subscription.sessionTableName ?? viewPortId;
      const sessionTable = this.#sessionTableMap[sessionTableName];
      if (!sessionTable) {
        return {
          type: "ERROR_RESULT",
          errorMessage: `addRow: no active session table for viewport ${viewPortId}`,
        };
      }
      const { data, key } = rpcRequest.params;
      const keyColumn = sessionTable.schema.key;
      const rowKey = data[keyColumn] ?? key ?? uuid();
      const rowData = { ...data, [keyColumn]: rowKey };

      const columnMap = sessionTable.map;
      const columnCount = Object.keys(columnMap).length;
      const row: VuuDataRow = new Array(columnCount).fill("");
      row[columnMap.vuuAction] = "addRow";
      for (const [col, idx] of Object.entries(columnMap)) {
        if (rowData[col] !== undefined) {
          row[idx] = rowData[col];
        }
      }
      sessionTable.insert(row);
      return { type: "SUCCESS_RESULT", data: undefined };
    }
    return {
      type: "ERROR_RESULT",
      errorMessage: "addRow: invalid rpc context",
    };
  };

  #registerSession(
    sessionTableName: string,
    sessionTable: Table,
    sourceTable: Table,
    sourceTableName: T,
  ) {
    this.#sessionTableMap[sessionTableName] = sessionTable;
    this.#sessionSourceTableMap[sessionTableName] = sourceTableName;
    this.#sessionSnapshots.set(
      sessionTableName,
      this.#snapshotSessionRows(sessionTable, sourceTable),
    );
  }

  #snapshotSessionRows(sessionTable: Table, sourceTable: Table) {
    const snapshots = new Map<string, TableRow>();
    const keyIndex = sessionTable.map[sessionTable.schema.key];
    for (const sessionRow of sessionTable.data) {
      const key = String(sessionRow[keyIndex]);
      const sourceRow = sourceTable.findByKey(key);
      if (sourceRow) {
        snapshots.set(key, sourceRow.slice());
      }
    }
    return snapshots;
  }

  #setSessionMessage(
    sessionTableName: string,
    sessionTable: Table,
    key: string,
    message: string,
  ) {
    if (sessionTable.map[this.#sessionTableMessageColumn] === undefined) {
      return;
    }
    sessionTable.update(key, this.#sessionTableMessageColumn, message);
    let keys = this.#sessionMessageKeys.get(sessionTableName);
    if (keys === undefined) {
      this.#sessionMessageKeys.set(sessionTableName, (keys = new Set()));
    }
    keys.add(key);
  }

  /** Clear messages written by a previous failed save of this session. */
  #clearSessionMessages(sessionTableName: string, sessionTable: Table) {
    const keys = this.#sessionMessageKeys.get(sessionTableName);
    if (keys) {
      for (const key of keys) {
        if (sessionTable.findByKey(key)) {
          sessionTable.update(key, this.#sessionTableMessageColumn, "");
        }
      }
      this.#sessionMessageKeys.delete(sessionTableName);
    }
  }

  /**
   * Collect the changes in a session table. Rows that already carry a
   * message (set by beforeSessionSave) are treated as handled.
   */
  #collectSessionChanges(
    sessionTableName: string,
    sessionTable: Table,
    sourceTable: Table,
  ): SessionRowChange[] {
    const snapshots = this.#sessionSnapshots.get(sessionTableName);
    const sessionMap = sessionTable.map;
    const actionIndex = sessionMap.vuuAction;
    const messageIndex = sessionMap[this.#sessionTableMessageColumn];
    const keyIndex = sessionMap[sourceTable.schema.key];
    const sourceColumns = sourceTable.schema.columns;
    const changes: SessionRowChange[] = [];
    for (const sessionRow of sessionTable.data) {
      const action = sessionRow[actionIndex];
      if (typeof action !== "string" || !SESSION_ACTIONS.has(action)) {
        continue;
      }
      if (
        action !== "deleteRow" &&
        messageIndex !== undefined &&
        sessionRow[messageIndex]
      ) {
        continue;
      }
      const key = String(sessionRow[keyIndex]);
      const row: TableRow = sourceColumns.map(
        ({ name }) => sessionRow[sessionMap[name]],
      );
      const sourceSnapshot = snapshots?.get(key);
      const baseline = sourceSnapshot ?? sourceTable.findByKey(key);
      const cellUpdates: Record<string, VuuRowDataItemType> = {};
      if (action !== "deleteRow") {
        sourceColumns.forEach(({ name }, i) => {
          if (
            action === "addRow" ||
            !baseline ||
            !Object.is(baseline[sourceTable.map[name]], row[i])
          ) {
            cellUpdates[name] = row[i] as VuuRowDataItemType;
          }
        });
      }
      changes.push({
        action: action as SessionTableAction,
        cellUpdates,
        key,
        row,
        sessionRow,
        sourceSnapshot,
      });
    }
    return changes;
  }

  /**
   * Prepare changes for save: report duplicate keys, missing source rows
   * and stale rows (unless force) via the session message column.
   */
  #prepareSessionSave(
    sessionTableName: string,
    sessionTable: Table,
    sourceTable: Table,
    hooks: Required<EditHooks>,
    force: boolean,
  ): { prepared: PreparedSessionSave } | { errorMessage: string } {
    const changes: PreparedSessionChange[] = [];
    let duplicateKey = false;
    let stale = false;
    for (const change of this.#collectSessionChanges(
      sessionTableName,
      sessionTable,
      sourceTable,
    )) {
      const { action, key } = change;
      const sourceRow = sourceTable.findByKey(key);
      if (action === "addRow") {
        if (sourceRow) {
          duplicateKey = true;
          this.#setSessionMessage(
            sessionTableName,
            sessionTable,
            key,
            `addRow:${key}:key already exists`,
          );
          continue;
        }
      } else if (!sourceRow) {
        if (action === "deleteRow") {
          // already deleted, nothing to do
          continue;
        }
        stale = true;
        this.#setSessionMessage(
          sessionTableName,
          sessionTable,
          key,
          `${action}:${key}:source row missing`,
        );
        continue;
      } else if (!force) {
        const staleColumns = hooks.getStaleColumns(
          sourceTable,
          sourceRow,
          change,
        );
        if (staleColumns.length > 0) {
          stale = true;
          this.#setSessionMessage(
            sessionTableName,
            sessionTable,
            key,
            `stale:${key}:${staleColumns.join("|")}`,
          );
          continue;
        }
      }
      changes.push({ ...change, sourceRow: sourceRow?.slice() });
    }
    if (stale) {
      return { errorMessage: STALE_UPDATE };
    } else if (duplicateKey) {
      return { errorMessage: DUPLICATE_KEY };
    }
    return { prepared: { sourceTable, sessionTable, changes } };
  }

  /** After a successful save the session stays open, with no pending changes. */
  #resetSession(
    sessionTableName: string,
    sessionTable: Table,
    sourceTable: Table,
  ) {
    const actionIndex = sessionTable.map.vuuAction;
    const messageIndex = sessionTable.map[this.#sessionTableMessageColumn];
    const keyIndex = sessionTable.map[sessionTable.schema.key];
    for (const sessionRow of sessionTable.data.slice()) {
      const key = String(sessionRow[keyIndex]);
      const action = sessionRow[actionIndex];
      if (action === "deleteRow") {
        sessionTable.delete(key);
      } else if (
        action ||
        (messageIndex !== undefined && sessionRow[messageIndex])
      ) {
        const updatedRow = sessionRow.slice();
        updatedRow[actionIndex] = "";
        if (messageIndex !== undefined) {
          updatedRow[messageIndex] = "";
        }
        sessionTable.updateRow(updatedRow);
      }
    }
    this.#sessionMessageKeys.delete(sessionTableName);
    this.#sessionSnapshots.set(
      sessionTableName,
      this.#snapshotSessionRows(sessionTable, sourceTable),
    );
  }

  private endEditSession: ServiceHandler = async (rpcRequest) => {
    if (isEndEditSessionRpcRequest(rpcRequest)) {
      const { viewPortId } = rpcRequest.context;
      // the viewport Id is the session table name
      const subscription = this.getSubscriptionByViewport(viewPortId);
      const sessionTableName = subscription.sessionTableName ?? viewPortId;
      const sessionTable = this.#sessionTableMap[sessionTableName];
      const { dataSource } = subscription;

      if (dataSource.table) {
        const sourceTableName =
          subscription.sourceTableName ??
          this.#sessionSourceTableMap[sessionTableName] ??
          dataSource.table.table;
        const sourceTable = this.tables[sourceTableName as T];

        if (rpcRequest.params.save !== true) {
          return { type: "SUCCESS_RESULT", data: undefined };
        }
        if (!sessionTable || !sourceTable) {
          return errorResult(
            `endEditSession: no active session table for viewport ${viewPortId}`,
          );
        }
        const { force = false } = rpcRequest.params as { force?: boolean };
        const hooks = this.#hooksFor(sourceTableName);
        const ctx = this.#editContext(
          viewPortId,
          sourceTableName,
          sessionTableName,
        );

        this.#clearSessionMessages(sessionTableName, sessionTable);

        try {
          await this.beforeSessionSave(sourceTable, sessionTable);
        } catch (error) {
          return errorResult(
            messageOf(error, "Unable to prepare session changes"),
          );
        }

        const prepare = () =>
          this.#prepareSessionSave(
            sessionTableName,
            sessionTable,
            sourceTable,
            hooks,
            force,
          );

        let preparation = prepare();
        if ("errorMessage" in preparation) {
          return errorResult(preparation.errorMessage);
        }

        try {
          let canSave = hooks.canSaveSession(preparation.prepared, ctx);
          if (isPromise<CanSaveSessionResult>(canSave)) {
            canSave = await canSave;
            // the source may have changed while we waited
            this.#clearSessionMessages(sessionTableName, sessionTable);
            preparation = prepare();
            if ("errorMessage" in preparation) {
              return errorResult(preparation.errorMessage);
            }
          }
          if (canSave !== true) {
            return errorResult(
              typeof canSave === "string" && canSave
                ? canSave
                : SAVE_NOT_PERMITTED,
            );
          }
        } catch (error) {
          return errorResult(messageOf(error, SAVE_NOT_PERMITTED));
        }

        try {
          const result = await hooks.applySessionSave(
            sessionTable,
            preparation.prepared,
            ctx,
          );
          if (result === false) {
            return errorResult(SAVE_FAILED);
          } else if (
            typeof result === "object" &&
            result !== null &&
            (result as RpcResult).type === "ERROR_RESULT"
          ) {
            return errorResult(
              (result as RpcResultError).errorMessage || SAVE_FAILED,
            );
          }
        } catch (error) {
          return errorResult(messageOf(error));
        }

        try {
          await this.afterSessionSave(sourceTable, sessionTable);
        } catch (error) {
          return errorResult(
            messageOf(error, "Unable to finalize session changes"),
          );
        }
        this.#resetSession(sessionTableName, sessionTable, sourceTable);
        return { type: "SUCCESS_RESULT", data: undefined };
      } else {
        throw Error("[VuuModule], exitEditMode");
      }
    } else {
      throw Error("[VuuModule] endEditSession invalid rpc type");
    }
  };

  // Bulk-edit with input in session table
  private applyBulkEdits: ServiceHandler = async (rpcRequest) => {
    if (rpcRequest.context.type === "VIEWPORT_CONTEXT") {
      const { viewPortId } = rpcRequest.context;
      const sessionTable = this.getSessionTable(viewPortId);
      for (let i = 0; i < sessionTable.data.length; i++) {
        const newRow = sessionTable.data[i];
        const { column, value } = rpcRequest.params as {
          column: NamedCurve;
          value: VuuRowDataItemType;
        };
        const keyIndex = sessionTable.map[sessionTable.schema.key];
        sessionTable.update(
          String(newRow[keyIndex]),
          column as string,
          value as VuuRowDataItemType,
        );
      }
      return {
        type: "SUCCESS_RESULT",
        data: undefined,
      };
    } else {
      throw Error("[VuuModule] applyBulkEdits invalid rpc type");
    }
  };

  protected createSessionTable(
    sourceTable: Table,
    sessionTableName: string,
    editSessionMode: EditSessionMode | CopyOption,
    dataSource: ModuleDataSource,
    sessionType?: SessionType,
  ) {
    if (editSessionMode === "All" || editSessionMode.endsWith("all-rows")) {
      return this.createSessionTableWithAllRows(sourceTable, sessionTableName);
    } else if (
      editSessionMode === "Selected" ||
      editSessionMode === "selected-rows"
    ) {
      return this.createSessionTableFromSelectedRows(
        sourceTable,
        sessionTableName,
        dataSource,
      );
    } else if (
      editSessionMode === "Empty" ||
      editSessionMode === "empty-session-table"
    ) {
      return this.createEmptySessionTable(
        sourceTable,
        sessionTableName,
        sessionType,
      );
    } else {
      throw Error(
        `[VuuModule] createSessionTable, invalid editSessionMode ${editSessionMode}`,
      );
    }
  }

  protected createSessionTableWithAllRows(
    { data, schema }: Table,
    _sessionTableName: string,
  ) {
    const sessionSchema = sessionTableSchema(schema);
    return new Table(
      sessionSchema,
      data.map((row) => sessionTableRow(row, schema)),
      buildDataColumnMapFromSchema(sessionSchema),
    );
  }

  protected createEmptySessionTable(
    { schema }: Table,
    sessionTableName: string,
    sessionType?: SessionType,
  ) {
    // Override schema.table.table so isSessionTable() returns true for this session.
    // sessionTableSchema adds the vuuMsg column, consistent with all other session tables.
    const sessionSchema = sessionTableSchema({
      ...schema,
      table: { ...schema.table, table: sessionTableName },
    });
    if (sessionType === "import") {
      (
        sessionSchema.columns as { name: string; serverDataType: string }[]
      ).push({ name: "vuuRowNum", serverDataType: "int" });
    }
    return new Table(
      sessionSchema,
      [],
      buildDataColumnMapFromSchema(sessionSchema),
    );
  }

  protected createSessionTableFromSelectedRows(
    { data, map, schema }: Table,
    sessionTableName: string,
    dataSource: ModuleDataSource,
  ) {
    const selectedRowIds = dataSource.getSelectedRowIds();
    const keyIndex = map[schema.key];
    const sessionData: Array<Array<bigint | VuuRowDataItemType>> = [];
    for (let i = 0; i < selectedRowIds.length; i++) {
      for (let j = 0; j < data.length; j++) {
        if (data[j][keyIndex] === selectedRowIds[i]) {
          sessionData.push(sessionTableRow(data[j], schema));
        }
      }
    }
    // Note we preserve the original table name on the schema for the session table,
    // this will later be used to retrieve source table
    const sessionSchema = sessionTableSchema(schema);

    return new Table(
      sessionSchema,
      sessionData,
      buildDataColumnMapFromSchema(sessionSchema),
    );
  }

  /**
   * These services are available on any table. The client must configure the appropriate
   * menu item(s) on Table(s). The services to implement these RPC calls are built-in to
   * VuuModule
   */
  #defaultServices: RpcService[] = [
    {
      rpcName: "addRow",
      service: this.addRow,
    },
    {
      rpcName: "VP_BULK_EDIT_COLUMN_CELLS_RPC",
      service: this.applyBulkEdits,
    },
    {
      rpcName: "createSessionTable",
      service: this.createSessionTableService,
    },
    {
      rpcName: "beginEditSession",
      service: this.beginEditSession,
    },
    {
      rpcName: "deleteRow",
      service: this.deleteRow,
    },
    {
      rpcName: "deleteSelectedRows",
      service: this.deleteSelectedRows,
    },
    {
      rpcName: "endEditSession",
      service: this.endEditSession,
    },
    {
      rpcName: "editCell",
      service: this.editCell,
    },
    {
      rpcName: "undoRowChange",
      service: this.undoRowChange,
    },
  ];

  /**
   * These services are available on any table. The client must configure the appropriate
   * menu item(s) on Table(s). The services to implement these RPC calls are built-in to
   * VuuModule
   */
  #moduleMenuServices: RpcMenuService[] = [
    {
      rpcName: "beginEditSession",
      service: this.beginEditSessionMenuHandler,
    },
  ];
}

/**
 * Merge service lists by rpcName, later lists overriding earlier ones.
 */
const mergeServices = <S extends { rpcName: string }>(
  ...serviceLists: Array<S[] | undefined>
): S[] => {
  const services = new Map<string, S>();
  for (const serviceList of serviceLists) {
    if (Array.isArray(serviceList)) {
      for (const service of serviceList) {
        services.set(service.rpcName, service);
      }
    }
  }
  return Array.from(services.values());
};
