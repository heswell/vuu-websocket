import {
  ClientToServerBody,
  ClientToServerMessage,
  ServerToClientBody,
  ServerToClientMessage,
  VuuColumnDataType,
} from "@vuu-ui/vuu-protocol-types";

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
}

export interface DataTableDefinition {
  columns: TableColumn[];
  createPath?: string;
  data?: VuuColumnDataType[];
  dataPath?: string;
  name: string;
  primaryKey: string;
  type: string;
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
> = (message: ClientToServerMessage<T>, session: ISession) => void;

export interface ISession {
  enqueue: (requestId: string, messageBody: ServerToClientBody) => void;
}
