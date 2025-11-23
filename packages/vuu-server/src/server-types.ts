import {
  ClientMessageBody,
  ServerMessageBody,
  ServerToClientTableRows,
  VuuClientMessage,
  VuuColumnDataType,
  VuuLoginRequest,
  VuuServerMessage,
  VuuTable,
} from "@vuu-ui/vuu-protocol-types";
import { TableSchema } from "@vuu-ui/vuu-data-types";
import { Table } from "@heswell/data";
import { ServerWebSocket } from "bun";
import { JoinTableProvider } from "./provider/JoinTableProvider";

export interface ServiceDefinition {
  name: string;
  module: string;
  /**
   * path to modules folder
   */
  modules?: string;
}

export declare type TableColumnType = {
  name: string;
};

export declare type TableColumn = {
  aggregate?: "avg" | "sum";
  name: string;
  type?: VuuColumnDataType;
};

export interface DataTableDefinition {
  joinProvider?: JoinTableProvider;
  schema: TableSchema;
}

export interface ServerConfig {
  service: ServiceDefinition;
  DataTables?: DataTableDefinition[];
  TableService?: DataTableAPI;
}

export interface ServerMessagingConfig {
  CLIENT_UPDATE_FREQUENCY?: number;
  HEARTBEAT_FREQUENCY?: number;
  PRIORITY_UPDATE_FREQUENCY?: number;
}

export interface ConfiguredService {
  configure: (props: ServerConfig) => Promise<void>;
}

export declare type RowMeta = {
  IDX: number;
};

export interface IMessageQueue {
  // TODO better name
  find: (vpId: string) => VuuServerMessage<ServerToClientTableRows> | undefined;
  push(message: VuuServerMessage, rowMeta?: RowMeta): void;
}

export declare type RestHandler = (request: Request) => Response;

export declare type VuuProtocolHandler<
  T extends ClientMessageBody = ClientMessageBody
> = (message: VuuClientMessage<T>, session: ISession) => void;

export interface ISession {
  addViewport: (viewportId: string) => void;
  removeViewport: (viewportId: string) => void;
  clear: () => void;
  enqueue: (requestId: string, messageBody: ServerMessageBody) => void;
  dequeueAllMessages: () => null | (VuuServerMessage | string)[];
  kill: () => void;
  login: (requestId: string, message: VuuLoginRequest) => void;
  readonly id: string;
  readonly clientUnresponsive?: boolean;
  incomingHeartbeat?: number;
  outgoingHeartbeat?: number;
  readonly viewports: string[];
  readonly ws: ServerWebSocket;
}

export interface DataTableService extends ConfiguredService {
  getTable: (vuuTable: VuuTable) => Table;
  getTableList: () => VuuTable[];
}
export declare type DataTableAPI = Omit<
  DataTableService,
  keyof ConfiguredService
>;
