import {
  VuuMenu,
  VuuMenuItem,
  ClientToServerCloseTreeNode,
  ClientToServerOpenTreeNode,
  DeselectAllRequest,
  DeselectRowRequest,
  SelectAllRequest,
  SelectRowRangeRequest,
  SelectRowRequest,
  ViewportRpcContext,
  VuuClientMessage,
  VuuCreateVisualLink,
  VuuRemoveVisualLink,
  VuuRpcMenuRequest,
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
  ChangeViewPortSuccess,
  CreateViewPortReject,
  CreateViewPortSuccess,
  DeselectAllSuccess,
  DeselectRowSuccess,
  ErrorResponse,
  GetTableListResponse,
  GetTableMetaResponse,
  GetViewPortMenusResponse,
  GetViewPortVisualLinksResponse,
  JsonViewServerMessage,
  RpcResponseNew,
  SelectAllReject,
  SelectAllSuccess,
  SelectRowRangeSuccess,
  SelectRowSuccess,
  VsMsg,
  ViewPortMenuRpcReject,
  ViewPortMenuRpcResponse,
  type ViewServerMessage,
  type ViewServerMessageBody,
} from "../net/Messages";
import { RequestContext } from "../net/RequestProcessor";
import { RpcErrorResult } from "../net/rpc/RpcResult";
import { ServerApi } from "../net/ServerApi";
import { ProviderContainer } from "../provider/ProviderContainer";
import { ViewPortRange } from "../viewport/Viewport";
import { ViewportContainer } from "../viewport/ViewportContainer";
import { TableContainer } from "./table/TableContainer";
import { DataTable } from "./table/InMemDataTable";
import { InMemSessionDataTable } from "./table/InMemSessionDataTable";
import { getLogger, type Logger } from "@heswell/service-utils/browser";
import {
  ClientRequestError,
  errorMessage,
  isClientRequestError,
  TableNotFoundError,
} from "../net/ClientRequestError";

const log = getLogger("vuu.core");
const rpcLog = getLogger("vuu.rpc");

const vsMsg = (body: ViewServerMessageBody, ctx: RequestContext) =>
  JsonViewServerMessage(ctx.requestId, ctx.session.sessionId, body);

// The menus response must have a root folder; a lone item gets wrapped.
const asRootMenu = (menu: VuuMenu | VuuMenuItem): VuuMenu =>
  "menus" in menu ? menu : { name: "ROOT", menus: [menu] };

const errorMsg = (s: string, ctx: RequestContext) =>
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

const isMenuRpcRequest = (
  body: VuuClientMessage["body"],
): body is VuuRpcMenuRequest =>
  body.type === "VIEW_PORT_MENUS_SELECT_RPC" ||
  body.type === "VIEW_PORT_MENU_TABLE_RPC" ||
  body.type === "VIEW_PORT_MENU_ROW_RPC" ||
  body.type === "VIEW_PORT_MENU_CELL_RPC";

const failedRequest = (ctx: RequestContext) =>
  `Failed to process request ${ctx.requestId}`;

/**
 * Logs a failed request. A {@link ClientRequestError} is an expected refusal
 * (warn, no stack); anything else is a server fault (error, with stack).
 * Returns the message that is safe to send to the client.
 */
const logRequestError = (
  logger: Logger,
  description: string,
  error: unknown,
  ctx: RequestContext,
) => {
  const where = `(${ctx.requestId}, session ${ctx.session.sessionId})`;
  if (isClientRequestError(error)) {
    logger.warn(`${description} refused ${where}: ${error.reason}`);
    return error.reason;
  }
  logger.error(`${description} failed ${where}`, error);
  return failedRequest(ctx);
};

/**
 * The reject/error reply for a request that could not be processed, using
 * the protocol's specific reject message where there is one.
 */
const rejectBody = (
  body: VuuClientMessage["body"],
  reason: string,
): ViewServerMessageBody => {
  switch (body.type) {
    case "CREATE_VP":
      return CreateViewPortReject(body.table, reason);
    case "RPC_REQUEST":
      return createErrorRpcResponse(body, reason);
    case "SELECT_ROW":
      return { type: "SELECT_ROW_REJECT", vpId: body.vpId, errorMsg: reason };
    case "DESELECT_ROW":
      return { type: "DESELECT_ROW_REJECT", vpId: body.vpId, errorMsg: reason };
    case "SELECT_ROW_RANGE":
      return {
        type: "SELECT_ROW_RANGE_REJECT",
        vpId: body.vpId,
        errorMsg: reason,
      };
    case "SELECT_ALL":
      return SelectAllReject(body.vpId, reason);
    case "DESELECT_ALL":
      return { type: "DESELECT_ALL_REJECT", vpId: body.vpId, errorMsg: reason };
    default:
      if (isMenuRpcRequest(body)) {
        return ViewPortMenuRpcReject(body.vpId, body.rpcName, reason);
      }
      return ErrorResponse(reason);
  }
};

export class CoreServerApiHandler implements ServerApi {
  constructor(
    private viewPortContainer: ViewportContainer,
    private tableContainer: TableContainer,
    private providers: ProviderContainer,
  ) {}

  /**
   * Never throws: a request that fails is answered with the matching reject
   * (CREATE_VP_REJECT, VIEW_PORT_MENU_REJ, an RPC ERROR_RESULT, ...) or an
   * ERROR message, so one bad request cannot take the server down.
   */
  async process(
    msg: VuuClientMessage,
    ctx: RequestContext,
  ): Promise<ViewServerMessage | undefined> {
    try {
      return await this.dispatch(msg, ctx);
    } catch (error) {
      const { body } = msg;
      const reason = logRequestError(
        body.type === "RPC_REQUEST" || isMenuRpcRequest(body) ? rpcLog : log,
        body.type,
        error,
        ctx,
      );
      return vsMsg(rejectBody(body, reason), ctx);
    }
  }

  private async dispatch(
    { body }: VuuClientMessage,
    ctx: RequestContext,
  ): Promise<ViewServerMessage | undefined> {
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
      case "SELECT_ALL":
        return this.processSelectAllRequest(body, ctx);
      case "DESELECT_ALL":
        return this.processDeselectAllRequest(body, ctx);
      case "SELECT_ROW_RANGE":
        return this.processSelectRowRangeRequest(body, ctx);
      case "OPEN_TREE_NODE":
        return this.processOpenTreeNodeRequest(body, ctx);
      case "CLOSE_TREE_NODE":
        return this.processCloseTreeNodeRequest(body, ctx);
      case "CREATE_VISUAL_LINK":
        return this.processCreateVisualLinkRequest(body, ctx);
      case "REMOVE_VISUAL_LINK":
        return this.processRemoveVisualLinkRequest(body, ctx);
      case "VIEW_PORT_MENUS_SELECT_RPC":
      case "VIEW_PORT_MENU_TABLE_RPC":
      case "VIEW_PORT_MENU_ROW_RPC":
      case "VIEW_PORT_MENU_CELL_RPC":
        return this.processMenuRpcRequest(body, ctx);
      default:
        throw new ClientRequestError(
          `[VUU:core:CoreServerApiHandler] unsupported message type ${(body as { type: string }).type}`,
          `unsupported message type ${(body as { type: string }).type}`,
        );
    }
  }

  private processGetTableMetaRequest(
    msg: VuuTableMetaRequest,
    ctx: RequestContext,
  ) {
    const table = this.tableContainer.getTable<DataTable>(msg.table.table);
    if (
      table instanceof InMemSessionDataTable &&
      table.ownerSessionId !== ctx.session.sessionId
    ) {
      // a session table is private to the client session that created it
      throw new TableNotFoundError(table.name);
    }
    if (table) {
      const metaColumns = this.viewPortContainer.getTableMetaColumns(table);
      const columns = metaColumns.map((col) => col.name);
      const dataTypes = metaColumns.map((col) => col.dataType);
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
      return errorMsg(logRequestError(log, "GET_TABLE_LIST", e, ctx), ctx);
    }
  }

  private processCreateViewPortRequest(
    msg: VuuViewportCreateRequest,
    ctx: RequestContext,
  ) {
    const tableName = msg.table.table;
    const table = this.tableContainer.getTable<DataTable>(tableName);
    // if (table.getTableDef.visibility !== Public)
    if (msg.columns.length === 1 && msg.columns[0] === "*") {
      log.trace("create viewport with all columns");
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
      log.debug(
        `created viewport ${viewport.id} on table ${tableName}`,
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
    try {
      const viewport = this.viewPortContainer.getViewportForSession(
        viewPortId,
        ctx.session,
      );
      viewport.changeViewport(options);
      return vsMsg(ChangeViewPortSuccess(viewPortId, options), ctx);
    } catch (e) {
      logRequestError(log, `CHANGE_VP ${viewPortId}`, e, ctx);
      return errorMsg(
        `Failed to change viewport ${viewPortId}: ${isClientRequestError(e) ? e.reason : errorMessage(e)}`,
        ctx,
      );
    }
  }

  private processGetViewPortVisualLinksRequest(
    { vpId }: VuuViewportVisualLinksRequest,
    ctx: RequestContext,
  ) {
    const links = this.viewPortContainer.getViewPortVisualLinks(
      vpId,
      ctx.session,
    );
    return vsMsg(GetViewPortVisualLinksResponse(vpId, links), ctx);
  }

  private processGetViewPortMenusRequest(
    { vpId }: VuuViewportMenusRequest,
    ctx: RequestContext,
  ) {
    const viewPort = this.viewPortContainer.getViewportForSession(
      vpId,
      ctx.session,
    );
    const menu = viewPort.viewPortDef.service.menuItems.asJson;
    return vsMsg(GetViewPortMenusResponse(vpId, asRootMenu(menu)), ctx);
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
      return errorMsg(logRequestError(log, "CHANGE_VP_RANGE", e, ctx), ctx);
    }
  }

  private async processRpcRequest(
    msg: VuuRpcServiceRequest,
    ctx: RequestContext,
  ) {
    if (hasViewPortContext(msg)) {
      rpcLog.debug(
        `RPC ${msg.rpcName} on vp ${msg.context.viewPortId}`,
      );
      return this.handleViewportRpcRequest(msg, msg.context.viewPortId, ctx);
    } else {
      rpcLog.warn(
        `Invalid context on request ${ctx.requestId}`,
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
        rpcLog.error(
          `RPC ${msg.rpcName} on vp ${viewPortId} failed (${ctx.requestId}, session ${ctx.session.sessionId}): ${rpcResult.errorMessage}`,
        );
        return vsMsg(
          createErrorRpcResponse(
            msg,
            rpcResult.errorMessage,
            "data" in rpcResult ? rpcResult.data : undefined,
          ),
          ctx,
        );
      }
    } catch (e) {
      return vsMsg(
        createErrorRpcResponse(
          msg,
          logRequestError(
            rpcLog,
            `RPC ${msg.rpcName} on vp ${viewPortId}`,
            e,
            ctx,
          ),
        ),
        ctx,
      );
    }
  }

  private async processMenuRpcRequest(
    msg: VuuRpcMenuRequest,
    ctx: RequestContext,
  ) {
    const { rpcName, type, vpId } = msg;
    try {
      const action = await this.viewPortContainer.callMenuRpc(msg, ctx);
      return vsMsg(ViewPortMenuRpcResponse(vpId, rpcName, action), ctx);
    } catch (e) {
      const reason = logRequestError(
        rpcLog,
        `${type} ${rpcName} on vp ${vpId}`,
        e,
        ctx,
      );
      return vsMsg(ViewPortMenuRpcReject(vpId, rpcName, reason), ctx);
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
      logRequestError(log, "DISABLE_VP", e, ctx);
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
      logRequestError(log, "ENABLE_VP", e, ctx);
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
    try {
      this.viewPortContainer.removeViewport(viewPortId, ctx.session);
      return vsMsg(
        {
          type: "REMOVE_VP_SUCCESS",
          viewPortId,
        },
        ctx,
      );
    } catch (e) {
      return errorMsg(logRequestError(log, "REMOVE_VP", e, ctx), ctx);
    }
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
    } catch (e) {
      const reason = logRequestError(log, "SELECT_ROW", e, ctx);
      return vsMsg(rejectBody(msg, reason), ctx);
    }
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

  private processSelectAllRequest(msg: SelectAllRequest, ctx: RequestContext) {
    try {
      const selectedRowCount = this.viewPortContainer.selectAll(
        msg.vpId,
        ctx.session,
      );
      return vsMsg(SelectAllSuccess(msg.vpId, selectedRowCount), ctx);
    } catch (e) {
      return vsMsg(
        SelectAllReject(msg.vpId, logRequestError(log, "SELECT_ALL", e, ctx)),
        ctx,
      );
    }
  }

  private processDeselectAllRequest(
    msg: DeselectAllRequest,
    ctx: RequestContext,
  ) {
    this.viewPortContainer.deselectAll(msg.vpId, ctx.session);
    return vsMsg(DeselectAllSuccess(msg.vpId), ctx);
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
        ctx.session,
      );
      return vsMsg(SelectRowRangeSuccess(msg.vpId, selectedRowCount), ctx);
    } catch (e) {
      const reason = logRequestError(log, "SELECT_ROW_RANGE", e, ctx);
      return vsMsg(rejectBody(msg, reason), ctx);
    }
  }

  //--------------------------------------------------

  private processOpenTreeNodeRequest(
    { vpId, treeKey }: ClientToServerOpenTreeNode,
    ctx: RequestContext,
  ) {
    try {
      this.viewPortContainer.openTreeNode(vpId, treeKey, ctx.session);
      return vsMsg({ type: "OPEN_TREE_SUCCESS" }, ctx);
    } catch (e) {
      return errorMsg(logRequestError(log, "OPEN_TREE_NODE", e, ctx), ctx);
    }
  }

  private processCloseTreeNodeRequest(
    { vpId, treeKey }: ClientToServerCloseTreeNode,
    ctx: RequestContext,
  ) {
    try {
      this.viewPortContainer.closeTreeNode(vpId, treeKey, ctx.session);
      return vsMsg({ type: "CLOSE_TREE_SUCCESS" }, ctx);
    } catch (e) {
      return errorMsg(logRequestError(log, "CLOSE_TREE_NODE", e, ctx), ctx);
    }
  }

  private processCreateVisualLinkRequest(
    {
      childVpId,
      parentVpId,
      childColumnName,
      parentColumnName,
    }: VuuCreateVisualLink,
    ctx: RequestContext,
  ) {
    try {
      this.viewPortContainer.linkViewPorts(
        childVpId,
        parentVpId,
        childColumnName,
        parentColumnName,
        ctx.session,
      );
      return vsMsg(
        {
          childVpId,
          childColumnName,
          parentVpId,
          parentColumnName,
          type: "CREATE_VISUAL_LINK_SUCCESS",
        },
        ctx,
      );
    } catch (e) {
      return errorMsg(logRequestError(log, "CREATE_VISUAL_LINK", e, ctx), ctx);
    }
  }

  private processRemoveVisualLinkRequest(
    { childVpId }: VuuRemoveVisualLink,
    ctx: RequestContext,
  ) {
    try {
      this.viewPortContainer.unlinkViewPorts(childVpId, ctx.session);
      return vsMsg({ childVpId, type: "REMOVE_VISUAL_LINK_SUCCESS" }, ctx);
    } catch (e) {
      return errorMsg(logRequestError(log, "REMOVE_VISUAL_LINK", e, ctx), ctx);
    }
  }

  disconnect(session: ClientSessionId) {
    log.debug(`disconnect session ${session.sessionId}`);
    this.viewPortContainer.removeForSession(session);
    this.tableContainer.removeSessionTables(session);
  }
}
