import {
  ClientMessageBody,
  ServerMessageBody,
  VuuClientMessage,
  VuuColumnDataType,
} from "@vuu-ui/vuu-protocol-types";
import { TableSchema } from "@vuu-ui/vuu-data-types";
import { Table } from "@heswell/data";

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
  schema: TableSchema;
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

export declare type RestHandler = (request: Request) => Response;

export declare type VuuProtocolHandler<
  T extends ClientMessageBody = ClientMessageBody
> = (message: VuuClientMessage<T>, session: ISession) => void;

export interface ISession {
  addViewport: (viewportId: string) => void;
  enqueue: (requestId: string, messageBody: ServerMessageBody) => void;
  id: string;
  readonly viewports: string[];
  readonly ws: WebSocket;
}

export interface DataTableService extends ConfiguredService {
  getTable: (vuuTable: VuuTable) => Table;
  getTableList: () => VuuTable[];
}
export declare type DataTableAPI = Omit<
  DataTableService,
  keyof ConfiguredService
>;
