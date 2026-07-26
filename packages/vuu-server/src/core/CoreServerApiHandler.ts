import {
  ClientToServerMenuSelectRPC,
  DeselectRowRequest,
  SelectRowRangeRequest,
  SelectRowRequest,
  ServerMessageBody,
  ViewportRpcContext,
  VuuClientMessage,
  VuuCreateVisualLink,
  VuuRemoveVisualLink,
  VuuRpcServiceRequest,
  VuuTableListRequest,
  VuuTableMetaRequest,
  VuuViewportChangeRequest,
  VuuViewportCreateRequest,
  VuuViewportDisableRequest,
  VuuViewportEnableRequest,
  VuuViewportMenusRequest,
  VuuViewportRangeRequest,
  VuuViewportRemoveRequest,
  VuuViewportVisualLinksRequest,
} from "@vuu-ui/vuu-protocol-types";
import { hasViewPortContext } from "@vuu-ui/vuu-utils";
import { ClientSessionId } from "../net/ClientConnectionCreator";
import {
  ChangeViewPortRangeSuccess,
  CreateViewPortReject,
  CreateViewPortSuccess,
  DeselectRowSuccess,
  ErrorResponse,
  GetTableListResponse,
  GetTableMetaResponse,
  GetViewPortMenusResponse,
  GetViewPortVisualLinksResponse,
  JsonViewServerMessage,
  RpcResponseNew,
  SelectRowRangeSuccess,
  SelectRowSuccess,
  VsMsg,
} from "../net/Messages";
import { RequestContext } from "../net/RequestProcessor";
import { RpcErrorResult } from "../net/rpc/RpcResult";
import { ServerApi } from "../net/ServerApi";
import { ProviderContainer } from "../provider/ProviderContainer";
import { ISession } from "../server-types";
import { ViewPortRange } from "../viewport/Viewport";
import { ViewportContainer } from "../viewport/ViewportContainer";
import { TableContainer } from "./table/TableContainer";
import { DataTable } from "./table/InMemDataTable";

const vsMsg = (body: ServerMessageBody, ctx: RequestContext) =>
  JsonViewServerMessage(ctx.requestId, ctx.session.sessionId, body);

const errorMsg = (s: String, ctx: RequestContext) =>
  VsMsg(ctx.requestId, ctx.session.sessionId, ErrorResponse(s));

const createErrorRpcResponse = (
  msg: VuuRpcServiceRequest,
  errorMessage: string,
  data?: unknown,
) =>
  RpcResponseNew(
    msg.rpcName,
    RpcErrorResult(errorMessage, data),
    {},
    // ShowNotificationAction(
    //   NotificationType.Error,
    //   `Failed to process ${msg.rpcName} request`,
    //   errorMessage,
    // ),
  );

export class CoreServerApiHandler implements ServerApi {
  constructor(
    private viewPortContainer: ViewportContainer,
    private tableContainer: TableContainer,
    private providers: ProviderContainer,
  ) {}

  async process({ requestId, body }: VuuClientMessage, ctx: RequestContext) {
    switch (body.type) {
      case "HB_RESP":
        // do nothing
        break;
      case "GET_TABLE_META":
        return this.processGetTableMetaRequest(body, ctx);
      case "GET_TABLE_LIST":
        return this.processGetTableListRequest(body, ctx);
      case "CREATE_VP":
        return this.processCreateViewPortRequest(body, ctx);
      case "GET_VP_VISUAL_LINKS":
        return this.processGetViewPortVisualLinksRequest(body, ctx);
      case "GET_VIEW_PORT_MENUS":
        return this.processGetViewPortMenusRequest(body, ctx);
      case "CHANGE_VP_RANGE":
        return this.processViewPortRange(body, ctx);
      case "RPC_REQUEST":
        return this.processRpcRequest(body, ctx);
      case "CHANGE_VP":
        return this.processChangeViewPortRequest(body, ctx);
      case "REMOVE_VP":
        return this.processRemoveViewPortRequest(body, ctx);
      case "DISABLE_VP":
        return this.processDisableViewPortRequest(body, ctx);
      case "ENABLE_VP":
        return this.processEnableViewPortRequest(body, ctx);
      case "SELECT_ROW":
        return this.processSelectRowRequest(body, ctx);
      case "DESELECT_ROW":
        return this.processDeselectRowRequest(body, ctx);
      case "SELECT_ROW_RANGE":
        return this.processSelectRowRangeRequest(body, ctx);
      // case "CREATE_VISUAL_LINK":
      //   return this.processCreateVisualLinkRequest(requestId, body, session);
      // case "REMOVE_VISUAL_LINK":
      //   return this.processRemoveVisualLinkRequest(requestId, body, session);
      // case "DESELECT_ROW":
      //   return this.processDeselectRowRequest(requestId, body, session);
      // case "SELECT_ROW_RANGE":
      //   return this.processSelectRowRangeRequest(requestId, body, session);
      // case "VIEW_PORT_MENUS_SELECT_RPC":
      //   return this.processViewPortMenuSelectionRpcCall(
      //     requestId,
      //     body,
      //     session,
      //   );
      default:
        throw Error(
          `[VUU:core:CoreServerApiHandler] unsupported message type ${body.type}`,
        );
    }
  }

  private processGetTableMetaRequest(
    msg: VuuTableMetaRequest,
    ctx: RequestContext,
  ) {
    const table = this.tableContainer.getTable<DataTable>(msg.table.table);
    if (table) {
      const viewPortDef = this.viewPortContainer.getViewPortDefinition(table);
      const columns = viewPortDef.columns.map((col) => col.name);
      const dataTypes = viewPortDef.columns.map((col) => col.dataType);
      const { key, table: vuuTable } = table.schema;
      const tableMetaResponseBody = GetTableMetaResponse(
        vuuTable,
        columns,
        dataTypes,
        key,
      );
      return vsMsg(tableMetaResponseBody, ctx);
    } else {
      return errorMsg(`Failed to process request ${ctx.requestId}`, ctx);
    }
  }

  private processGetTableListRequest(
    _: VuuTableListRequest,
    ctx: RequestContext,
  ) {
    try {
      const tables = this.tableContainer.getDefinedTables();
      return vsMsg(GetTableListResponse(tables), ctx);
    } catch (e) {
      return errorMsg(`Failed to process request ${ctx.requestId}`, ctx);
    }
  }

  private processCreateViewPortRequest(
    msg: VuuViewportCreateRequest,
    ctx: RequestContext,
  ) {
    const tableName = msg.table.table;
    const table = this.tableContainer.getTable(tableName);
    // if (table.getTableDef.visibility !== Public)
    if (msg.columns.length === 1 && msg.columns[0] === "*") {
      console.log("all columns");
    } else {
      // validateColumns(table, msg.columns);
      // ViewPortColumnCreator.create(table, msg.columns)
    }

    const { requestId, user, session, queue } = ctx;

    const viewport = this.viewPortContainer.create(
      requestId,
      user,
      session,
      queue,
      table,
      // TODO revisit from  here
      msg,
    );

    if (viewport) {
      console.log(
        `[CoreServerApi] created viewport ${viewport.id} on table ${tableName}`,
      );

      // This diverges from the originasl;
      viewport.postDataForCurrentRange();

      return vsMsg(CreateViewPortSuccess(viewport.id, tableName, msg), ctx);
    } else {
      return vsMsg(
        CreateViewPortReject(
          msg.table,
          `Failed to process request ${ctx.requestId}`,
        ),
        ctx,
      );
    }
  }

  private processChangeViewPortRequest(
    { viewPortId, ...options }: VuuViewportChangeRequest,
    ctx: RequestContext,
  ) {
    const viewport = this.viewPortContainer.getViewportById(viewPortId);
    try {
      viewport.changeViewport(options);
    } catch (e) {
      console.error(e);
    }
  }

  private processGetViewPortVisualLinksRequest(
    { vpId }: VuuViewportVisualLinksRequest,
    ctx: RequestContext,
  ) {
    const links = this.viewPortContainer.getViewPortVisualLinks(vpId);
    return vsMsg(GetViewPortVisualLinksResponse(vpId, links), ctx);
  }

  private processGetViewPortMenusRequest(
    { vpId }: VuuViewportMenusRequest,
    ctx: RequestContext,
  ) {
    const viewPort = this.viewPortContainer.getViewportById(vpId);
    const menu = viewPort.viewPortDef.service.menuItems.asJson;
    return vsMsg(GetViewPortMenusResponse(vpId, menu), ctx);
  }

  private processViewPortRange(
    msg: VuuViewportRangeRequest,
    ctx: RequestContext,
  ) {
    try {
      this.viewPortContainer.changeRange(
        ctx.session,
        msg.viewPortId,
        ViewPortRange(msg.from, msg.to),
      );
      return vsMsg(
        ChangeViewPortRangeSuccess(msg.viewPortId, msg.from, msg.to),
        ctx,
      );
    } catch (e) {
      return errorMsg(`Failed to process request ${ctx.requestId}`, ctx);
    }
  }

  private async processRpcRequest(
    msg: VuuRpcServiceRequest,
    ctx: RequestContext,
  ) {
    if (hasViewPortContext(msg)) {
      console.log(`[CoreServerApiHandler] RPC ${msg.rpcName} on vp ${msg.context.viewPortId}`)
      return this.handleViewportRpcRequest(msg, msg.context.viewPortId, ctx);
    } else {
      console.warn(
        `[CoreServerApiHandler] Imvalid context on request ${ctx.requestId}`,
      );
      return vsMsg(
        createErrorRpcResponse(
          msg,
          `Failed to process request ${ctx.requestId}`,
        ),
        ctx,
      );
    }
  }
  private async handleViewportRpcRequest(
    msg: VuuRpcServiceRequest<ViewportRpcContext>,
    viewPortId: string,
    ctx: RequestContext,
  ) {
    try {
      const rpcResult = await this.viewPortContainer.handleRpcRequest(
        viewPortId,
        msg.rpcName,
        msg.params,
        ctx,
      );

      if (rpcResult.type === "SUCCESS_RESULT") {
        return vsMsg(RpcResponseNew(msg.rpcName, rpcResult, {}), ctx);
      } else {
        return vsMsg(
          createErrorRpcResponse(msg, rpcResult.errorMessage, rpcResult.data),
          ctx,
        );
      }
    } catch (e) {
      console.log({ e });
      return vsMsg(
        createErrorRpcResponse(
          msg,
          `Failed to process request ${ctx.requestId}`,
        ),
        ctx,
      );
    }
  }

  private processDisableViewPortRequest(
    { viewPortId }: VuuViewportDisableRequest,
    ctx: RequestContext,
  ) {
    try {
      this.viewPortContainer.disableViewport(viewPortId, ctx.session);
      return vsMsg(
        {
          type: "DISABLE_VP_SUCCESS",
          viewPortId,
        },
        ctx,
      );
    } catch (e) {
      return vsMsg(
        {
          type: "ERROR",
          msg: (e as Error).message,
        },
        ctx,
      );
    }
  }

  private processEnableViewPortRequest(
    { viewPortId }: VuuViewportEnableRequest,
    ctx: RequestContext,
  ) {
    try {
      this.viewPortContainer.enableViewport(viewPortId, ctx.session);
      return vsMsg(
        {
          type: "ENABLE_VP_SUCCESS",
          viewPortId,
        },
        ctx,
      );
    } catch (e) {
      return vsMsg(
        {
          type: "ERROR",
          msg: (e as Error).message,
        },
        ctx,
      );
    }
  }

  private processRemoveViewPortRequest(
    { viewPortId }: VuuViewportRemoveRequest,
    ctx: RequestContext,
  ) {
    this.viewPortContainer.removeViewport(viewPortId);
    return vsMsg(
      {
        type: "REMOVE_VP_SUCCESS",
        viewPortId,
      },
      ctx,
    );
  }

  private processSelectRowRequest(msg: SelectRowRequest, ctx: RequestContext) {
    try {
      const selectedRowCount = this.viewPortContainer.selectRow(
        ctx.session,
        msg.vpId,
        msg.rowKey,
        msg.preserveExistingSelection,
      );
      return vsMsg(SelectRowSuccess(msg.vpId, selectedRowCount), ctx);
    } catch (e) {}
  }

  private processDeselectRowRequest(
    msg: DeselectRowRequest,
    ctx: RequestContext,
  ) {
    const selectedRowCount = this.viewPortContainer.deselectRow(
      ctx.session,
      msg.vpId,
      msg.rowKey,
      msg.preserveExistingSelection,
    );
    return vsMsg(DeselectRowSuccess(msg.vpId, selectedRowCount), ctx);
  }

  private processSelectRowRangeRequest(
    msg: SelectRowRangeRequest,
    ctx: RequestContext,
  ) {
    try {
      const selectedRowCount = this.viewPortContainer.selectRowRange(
        msg.vpId,
        msg.fromRowKey,
        msg.toRowKey,
        msg.preserveExistingSelection,
      );
      return vsMsg(SelectRowRangeSuccess(msg.vpId, selectedRowCount), ctx);
    } catch (e) {}
  }

  //--------------------------------------------------

  private processCreateVisualLinkRequest(
    requestId: string,
    {
      childVpId,
      parentVpId,
      childColumnName,
      parentColumnName,
    }: VuuCreateVisualLink,
    session: ISession,
  ) {
    this.viewPortContainer.linkViewPorts(
      childVpId,
      parentVpId,
      childColumnName,
      parentColumnName,
    );

    session.enqueue(requestId, {
      childVpId,
      childColumnName,
      parentVpId,
      parentColumnName,
      type: "CREATE_VISUAL_LINK_SUCCESS",
    });
  }

  private processRemoveVisualLinkRequest(
    requestId: string,
    { childVpId }: VuuRemoveVisualLink,
    session: ISession,
  ) {
    this.viewPortContainer.unlinkViewPorts(childVpId);
    session.enqueue(requestId, {
      childVpId,
      type: "REMOVE_VISUAL_LINK_SUCCESS",
    });
  }

  private processViewPortMenuSelectionRpcCall(
    requestId: string,
    { vpId, rpcName }: ClientToServerMenuSelectRPC,
    session: ISession,
  ) {
    const action = this.viewPortContainer.callRpcSelection(
      vpId,
      rpcName,
      session.id,
    );

    session.enqueue(requestId, {
      action,
      rpcName,
      type: "VIEW_PORT_MENU_RESP",
      vpId,
    });
  }

  disconnect(session: ClientSessionId) {
    console.log("TODO COreServerApiHandler disconnect");
    this.viewPortContainer.removeForSession(session);
    this.tableContainer.removeSessionTables(session);
  }
}
