import {
  ClientToServerBody,
  ServerToClientBody,
  ServerToClientMessage,
  VuuClientToServerMessage,
  VuuColumnDataType,
} from "@vuu-ui/vuu-protocol-types";
import { TableSchema } from "@vuu-ui/vuu-data-types";

export interface ServiceDefinition {
  name: string;
  module: string;
}

export type TableColumnType = {
  name: string;
};

export type TableColumn = {
  aggregate?: "avg" | "sum";
  name: string;
  type?: VuuColumnDataType;
};

interface TableUpdateOptions {
  applyInserts?: boolean;
  applyUpdates?: boolean;
  fields?: string[];
  insertInterval?: number;
  updateInterval?: number;
}

export interface DataTableDefinition {
  schema: TableSchema;
  createPath?: string;
  data?: VuuDataRow[];
  dataPath?: string;
  updatePath?: string;
  updates?: TableUpdateOptions;
}

export interface ServerConfig {
  service: ServiceDefinition;
  DataTables?: DataTableDefinition[];
  TableService?: DataTableApi;
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
  push(message: ServerToClientMessage, rowMeta?: RowMeta): void;
}

export type RestHandler = (request: Request) => Response;

export type VuuRequestHandler<
  T extends ClientToServerBody = ClientToServerBody
> = (message: VuuClientToServerMessage<T>, session: ISession) => void;

export interface ISession {
  enqueue: (requestId: string, messageBody: ServerToClientBody) => void;
}

export interface DataTableService extends ConfiguredService {
  getTable: (vuuTable: VuuTable) => Table;
  getTableList: () => VuuTable[];
}
export type DataTableAPI = Omit<DataTableService, keyof ConfiguredService>;
