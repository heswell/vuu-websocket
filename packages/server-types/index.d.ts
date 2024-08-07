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
  services: ServiceDefinition[];
  DataTables: DataTableDefinition[];
}

export interface ServerMessagingConfig {
  CLIENT_UPDATE_FREQUENCY?: number;
  HEARTBEAT_FREQUENCY?: number;
  PRIORITY_UPDATE_FREQUENCY?: number;
}

export declare type RowMeta = {
  IDX: number;
};

export interface IMessageQueue {
  push(message: ServerToClientMessage, rowMeta?: RowMeta): void;
}

export type VuuRequestHandler<
  T extends ClientToServerBody = ClientToServerBody
> = (message: VuuClientToServerMessage<T>, session: ISession) => void;

export interface ISession {
  enqueue: (requestId: string, messageBody: ServerToClientBody) => void;
}
