import type {
  RpcResult,
  DeselectRowSuccess as VuuDeselectRowSuccess,
  SelectRowSuccess as VuuSelectRowSuccess,
  SelectRowRangeSuccess as VuuSelectRowRangeSuccess,
  ServerMessageBody,
  ServerToClientError,
  ServerToClientHeartBeat,
  ServerToClientTableRows,
  VuuColumnDataType,
  VuuLinkDescriptor,
  VuuLoginSuccessResponse,
  VuuMenu,
  VuuMenuItem,
  VuuRpcServiceResponse,
  VuuTable,
  VuuTableMetaResponse,
  VuuViewportCreateFailResponse,
  VuuViewportCreateRequest,
  VuuViewportCreateSuccessResponse,
  VuuViewportMenusResponse,
  VuuViewportRangeResponse,
  VuuViewportVisualLinksResponse,
} from "@vuu-ui/vuu-protocol-types";
import { RowUpdate } from "./row/RowUpdate";

interface ViewServerMessage {
  body: ServerMessageBody;
  module: string;
  requestId: string;
  sessionId: string;
}

export const HeartBeat = (ts: number): ServerToClientHeartBeat => ({
  ts,
  type: "HB",
});

export const JsonViewServerMessage = (
  requestId: string,
  sessionId: string,
  body: ServerMessageBody,
  module = "CORE",
): ViewServerMessage => ({
  requestId,
  sessionId,
  body,
  module,
});

export const VsMsg = (
  requestId: string,
  sessionId: string,
  body: ServerMessageBody,
  module: string = "CORE",
) => JsonViewServerMessage(requestId, sessionId, body, module);

export const ErrorResponse = (msg: string): ServerToClientError => ({
  msg,
  type: "ERROR",
});

export const LoginSuccess = (vuuServerId: string): VuuLoginSuccessResponse => ({
  type: "LOGIN_SUCCESS",
  vuuServerId,
});

export const GetTableMetaResponse = (
  table: VuuTable,
  columns: string[],
  dataTypes: VuuColumnDataType[],
  key: string,
): VuuTableMetaResponse => ({
  columns,
  dataTypes,
  key,
  table,
  type: "TABLE_META_RESP",
});

export const CreateViewPortSuccess = (
  viewPortId: string,
  table: string,
  msg: VuuViewportCreateRequest,
): VuuViewportCreateSuccessResponse => ({
  aggregations: msg.aggregations,
  columns: msg.columns,
  filterSpec: msg.filterSpec,
  groupBy: msg.groupBy,
  range: msg.range,
  sort: msg.sort,
  table,
  type: "CREATE_VP_SUCCESS",
  viewPortId,
});

export const CreateViewPortReject = (
  table: VuuTable,
  msg: string,
): VuuViewportCreateFailResponse => ({
  msg,
  table,
  type: "CREATE_VP_REJECT",
});

export const GetViewPortVisualLinksResponse = (
  vpId: string,
  links: VuuLinkDescriptor[],
): VuuViewportVisualLinksResponse => ({
  links,
  type: "VP_VISUAL_LINKS_RESP",
  vpId,
});

export const GetViewPortMenusResponse = (
  vpId: string,
  menu: VuuMenu,
): VuuViewportMenusResponse => ({
  menu,
  type: "VIEW_PORT_MENUS_RESP",
  vpId,
});

export const TableRowUpdates = (
  batch: string,
  isLast: boolean,
  timestamp: number,
  rows: RowUpdate[],
): ServerToClientTableRows => ({
  batch,
  isLast,
  rows,
  type: "TABLE_ROW",
  timestamp,
});

export const ChangeViewPortRangeSuccess = (
  viewPortId: string,
  from: number,
  to: number,
): VuuViewportRangeResponse => ({
  type: "CHANGE_VP_RANGE_SUCCESS",
  viewPortId,
  from,
  to,
});

export const RpcResponseNew = (
  rpcName: string,
  result: RpcResult,
  // action: UIAction,
  action: unknown,
): VuuRpcServiceResponse => ({
  action,
  result,
  rpcName,
  type: "RPC_RESPONSE",
});

export const SelectRowSuccess = (
  vpId: string,
  selectedRowCount: number,
): VuuSelectRowSuccess => ({
  selectedRowCount,
  type: "SELECT_ROW_SUCCESS",
  vpId,
});

export const DeselectRowSuccess = (
  vpId: string,
  selectedRowCount: number,
): VuuDeselectRowSuccess => ({
  selectedRowCount,
  type: "DESELECT_ROW_SUCCESS",
  vpId,
});

export const SelectRowRangeSuccess = (
  vpId: string,
  selectedRowCount: number,
): VuuSelectRowRangeSuccess => ({
  selectedRowCount,
  type: "SELECT_ROW_RANGE_SUCCESS",
  vpId,
});
