import {
  ServerMessageBody,
  VuuColumnDataType,
  VuuLinkDescriptor,
  VuuLoginSuccessResponse,
  VuuMenu,
  VuuMenuItem,
  VuuTable,
  VuuTableMetaResponse,
  VuuViewportCreateFailResponse,
  VuuViewportCreateRequest,
  VuuViewportCreateSuccessResponse,
  VuuViewportMenusResponse,
  VuuViewportVisualLinksResponse,
} from "@vuu-ui/vuu-protocol-types";

interface ViewServerMessage {
  body: ServerMessageBody;
  module: string;
  requestId: string;
  sessionId: string;
}

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
  menu: VuuMenu | VuuMenuItem,
): VuuViewportMenusResponse => ({
  menu,
  type: "VIEW_PORT_MENUS_RESP",
  vpId,
});
