import {
  ClientToServerBody,
  ClientToServerMessage,
  VuuRange,
} from "@vuu-ui/vuu-protocol-types";
import { MessageQueue } from "./messageQueue";
export interface ServiceDefinition {
  name: string;
  module: string;
  API: string[];
}

export interface VuuServerConfig {
  CLIENT_UPDATE_FREQUENCY?: number;
  HEARTBEAT_FREQUENCY?: number;
  PRIORITY_UPDATE_FREQUENCY?: number;
}

export interface MessageConfig {
  CLIENT_UPDATE_FREQUENCY: number;
  HEARTBEAT_FREQUENCY: number;
  PRIORITY_UPDATE_FREQUENCY: number;
}

export type TableColumnType = {
  name: string;
};

export type TableColumn = {
  filter?: any;
  key?: number;
  name: string;
  type?: TableColumnType | string;
};

export interface TableProps {
  columns: TableColumn[];
  data: any[];
  name: string;
  primaryKey: string;
  updates: any;
}

export interface TableWithGenerators {
  createPath?: string;
  updatePath?: string;
}

export interface TableConfig extends TableProps, TableWithGenerators {
  dataPath: string;
}

export interface ServerConfig {
  DataTables: TableConfig[];
  services: ServiceDefinition[];
}

export const MessageTypeOut = {
  Rowset: "rowset",
  Update: "update",
};

export interface ViewportMessage {
  viewport: string;
}

export interface RowsetMessage extends ViewportMessage {
  type: typeof MessageTypeOut.Rowset;
}
export interface UpdateMessage extends ViewportMessage {
  range: VuuRange;
  type: typeof MessageTypeOut.Update;
  updates: any[];
}

export type MessageOut = RowsetMessage | UpdateMessage;

export type VuuRequestHandler<
  T extends ClientToServerBody = ClientToServerBody
> = (message: ClientToServerMessage<T>, messageQueue: MessageQueue) => void;

export type RowMeta = {
  IDX: number;
};
