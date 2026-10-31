/**
 * Browser-safe entry: the Vuu server core, module authoring APIs and a
 * MessagePort transport, with no Node or Bun dependencies. Use it to run a
 * Vuu server in a Web Worker (see createLocalVuuServer). The main entry adds
 * Bun hosting: VuuServer (WebSocket + REST), auth providers and config.
 */
export {
  ViewServerModule as Module,
  type ModuleConstructorProps,
  type RealizedViewServerModule,
} from "./core/module/VsModule";
export type { TableDefContainer } from "./core/module/TableDefContainer";
export type { TableJoinFactory } from "./TableJoinProvider";
export type { Column as ColumnDef } from "./api/TableDef";
export type { ColumnValueProvider } from "./core/table/ColumnValueProvider";
export type { JoinTable } from "./core/table/JoinTable";
export type { CoreServerApiHandler } from "./core/CoreServerApiHandler";
export type { ServerApi } from "./net/ServerApi";
export type {
  RpcResponse,
  ViewServerMessage,
  ViewServerMessageBody,
} from "./net/Messages";
export {
  ViewPortMenuRpcReject,
  ViewPortMenuRpcResponse,
} from "./net/Messages";
export { ClientSessionId } from "./net/ClientConnectionCreator";
export type { RpcHandlerFunc } from "./net/rpc/RpcHandler";
export type { RpcResultErrorWithData } from "./net/rpc/RpcResult";
export type { PublishQueue } from "./util/PublishQueue";
export type { RuntimeViewPortVisualLink } from "./viewport/Viewport";
export type {
  SessionRowChange,
  SessionTableAction,
} from "./core/table/InMemSessionDataTable";
export type {
  RunnerCallback,
  RunnerErrorHandler,
} from "./toolbox/thread/LifeCycleRunner";
export { type Column, Columns } from "./core/table/Column";
export { TableContainer } from "./core/table/TableContainer";
export {
  type DataTable,
  InMemDataTable,
  isDataTable,
} from "./core/table/InMemDataTable";
export { ModuleContainer } from "./core/module/ModuleContainer";
export {
  InMemSessionDataTable,
  isSessionDataTable,
} from "./core/table/InMemSessionDataTable";
export { ProviderContainer } from "./provider/ProviderContainer";
export {
  NullProvider,
  Provider,
  RemoteProvider,
  type RemoteServiceDetails,
  type RemoteSubscriptionFactory,
} from "./provider/Provider";
export type { IProvider, ProviderFactory } from "./provider/Provider";
export { RpcHandler } from "./net/rpc/RpcHandler";
export { RpcNames } from "./util/RpcNames";
export { RpcParams, type RpcFunction } from "./net/rpc/Rpc";
export { RequestContext } from "./net/RequestProcessor";
export { RpcErrorResult, RpcSuccessResult } from "./net/rpc/RpcResult";
export { DefaultRpcHandler } from "./net/rpc/DefaultRpcHandler";
export {
  EditTableRpcHandler,
  type CellEdit,
} from "./net/rpc/EditTableRpcHandler";
export {
  VUU_SYSTEM_COLUMNS,
  coerceCellValue,
  isSystemColumn,
} from "./net/rpc/EditValidation";
export {
  CreateSessionTableRpcHandler,
  type EditSessionMode,
  type SessionTableCopyOption,
} from "./net/rpc/CreateSessionTableRpcHandler";
export {
  EndEditSessionRpcHandler,
  type CanSaveSessionResult,
  type SessionSaveResult,
  type PreparedSessionChange,
  type PreparedSessionSave,
} from "./net/rpc/EndEditSessionRpcHandler";
export { EditSessionRpcHandler } from "./net/rpc/EditSessionRpcHandler";
export {
  JoinTableProvider,
  type JoinDefToJoinTable,
} from "./provider/JoinTableProvider";
export type {
  DataTableDefinition,
  TableColumn,
  TableColumnType,
} from "./server-types";
export {
  Service,
  type IService,
  type RpcNamedParams,
  type ServiceMessage,
} from "./Service";
export * from "./api/TableDef";
export * from "./api/ViewPortDef";
export {
  ClientRequestError,
  TableNotFoundError,
  ViewportNotFoundError,
  isClientRequestError,
} from "./net/ClientRequestError";
export {
  SessionLimitError,
  SessionLimitPolicies,
} from "./net/ClientSessionContainer";
export { VuuCloseCode } from "./net/CloseCodes";
export {
  CloseDialog,
  CloseDialogViewPortAction,
  NoAction,
  OpenDialog,
  OpenDialogViewPortAction,
  ShowNotification,
  type ViewPortAction,
} from "./viewport/ViewPortAction";
export {
  type CellMenuFunc,
  CellViewPortMenuItem,
  EmptyViewPortMenu,
  MenuRpcTypeForContext,
  type MenuRpcResult,
  type MenuRpcSession,
  type RowMenuFunc,
  RowViewPortMenuItem,
  type SelectionMenuFunc,
  SelectionViewPortMenuItem,
  type TableMenuFunc,
  TableViewPortMenuItem,
  ViewPortMenu,
  ViewPortMenuFolder,
  ViewPortMenuItem,
} from "./viewport/ViewPortMenu";
export {
  Viewport,
  ViewPortRange,
  ViewPortSelection,
  ViewPortUpdate,
  ViewPortVisualLink,
  type ViewportCreateConfig,
  type ViewportEvents,
  type ViewPortRowUpdate,
  type ViewPortStructuralFields,
  type ViewPortUpdateType,
} from "./viewport/Viewport";
export {
  MenuRpcDispatchError,
  ViewportContainer,
  type ViewportCreationEvent,
  type ViewportEvents as ViewportContainerEvents,
  type ViewportRemovedEvent,
} from "./viewport/ViewportContainer";
export { OutboundRowPublishQueue } from "./util/PublishQueue";
export { RenderComponent } from "./viewport/RenderComponent";
export { ModuleFactory } from "./core/module/ModuleFactory";
export type {
  ServiceFactory,
  TableDefs,
  TableDefTuple,
} from "./core/module/ModuleFactory";
export { NotificationModule } from "./core/module/notifications/NotificationModule";
export {
  NotificationsSchema,
  type ColumnDefinition,
} from "./core/module/notifications/NotificationsSchema";
export {
  AllowAllPermissionFilter,
  DenyAllPermissionFilter,
  PermissionFilter,
  type PermissionFunction,
  type RowData,
} from "./core/filter/PermissionFilter";
export * from "./toolbox/thread/LifecycleContainer";
export { LifeCycleRunner } from "./toolbox/thread/LifeCycleRunner";
export {
  clearLogLevel,
  configureLogging,
  consoleSink,
  getLogger,
  getLogLevel,
  parseLogLevel,
  resetLogging,
  setLogLevel,
  setLogSink,
  type LogEntry,
  type Logger,
  type LogLevel,
  type LogMessageLevel,
  type LogSink,
} from "@heswell/service-utils/browser";
export type {
  LoginSuccessOptions,
  ModuleRecord,
  ModuleRegistry,
  ModuleWorkspaceDescriptor,
} from "./net/LoginSuccess";
export type { LoginSuccessProvider } from "./core/LoginSuccessProvider";
export { VuuUser, VuuUserWithAuthorizations } from "./core/auths/VuuUser";
export { VuuServerCore, type VuuServerCoreConfig } from "./core/VuuServerCore";
export type { LoginTokenService } from "./net/auth/LoginTokenService";
export {
  LocalLoginTokenService,
  type LocalLoginTokenServiceOptions,
} from "./net/auth/LocalLoginTokenService";
export type { ViewServerHandler } from "./net/ViewServerHandler";
export type { Channel } from "./net/ws/Channel";
export * from "./local";
