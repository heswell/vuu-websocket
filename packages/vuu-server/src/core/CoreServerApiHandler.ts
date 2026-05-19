import {
  ClientToServerMenuSelectRPC,
  DeselectRowRequest,
  SelectRowRangeRequest,
  SelectRowRequest,
  ServerMessageBody,
  VuuClientMessage,
  VuuCreateVisualLink,
  VuuMenu,
  VuuRemoveVisualLink,
  VuuRpcServiceRequest,
  VuuServerMessage,
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
import { ProviderContainer } from "../provider/ProviderContainer";
import { ViewportContainer } from "../viewport/ViewportContainer";
import { TableContainer } from "./table/TableContainer";
import { ISession } from "../server-types";
import { tableRowsMessageBody } from "@heswell/data";
import { hasViewPortContext } from "@vuu-ui/vuu-utils";
import { RequestContext } from "../net/RequestProcessor.ts";
import { ServerApi } from "../net/ServerApi.ts";
import {
  ChangeViewPortRangeSuccess,
  CreateViewPortReject,
  CreateViewPortSuccess,
  ErrorResponse,
  GetTableMetaResponse,
  GetViewPortMenusResponse,
  GetViewPortVisualLinksResponse,
  JsonViewServerMessage,
  VsMsg,
} from "../net/Messages.ts";
import { ViewPortRange } from "../viewport/Viewport.ts";

const vsMsg = (body: ServerMessageBody, ctx: RequestContext) =>
  JsonViewServerMessage(ctx.requestId, ctx.session.sessionId, body);

const errorMsg = (s: String, ctx: RequestContext) =>
  VsMsg(ctx.requestId, ctx.session.sessionId, ErrorResponse(s));

export class CoreServerApiHandler implements ServerApi {
  constructor(
    private viewPortContainer: ViewportContainer,
    private tableContainer: TableContainer,
    private providers: ProviderContainer,
  ) {}

  process({ requestId, body }: VuuClientMessage, ctx: RequestContext) {
    switch (body.type) {
      case "HB_RESP":
        // do nothing
        break;
      case "GET_TABLE_META":
        return this.processGetTableMetaRequest(body, ctx);
      case "CREATE_VP":
        return this.processCreateViewPortRequest(body, ctx);
      case "GET_VP_VISUAL_LINKS":
        return this.processGetViewPortVisualLinksRequest(body, ctx);
      case "GET_VIEW_PORT_MENUS":
        return this.processGetViewPortMenusRequest(body, ctx);
      case "CHANGE_VP_RANGE":
        return this.processViewPortRange(body, ctx);
      // case "GET_TABLE_LIST":
      //   session.enqueue(requestId, {
      //     type: "TABLE_LIST_RESP",
      //     tables: this.tableContainer.getDefinedTables(),
      //   });
      //   break;
      // case "REMOVE_VP":
      //   return this.processRemoveViewPortRequest(requestId, body, session);
      // case "DISABLE_VP":
      //   return this.processDisableViewPortRequest(requestId, body, session);
      // case "ENABLE_VP":
      //   return this.processEnableViewPortRequest(requestId, body, session);
      // case "CREATE_VISUAL_LINK":
      //   return this.processCreateVisualLinkRequest(requestId, body, session);
      // case "REMOVE_VISUAL_LINK":
      //   return this.processRemoveVisualLinkRequest(requestId, body, session);
      // case "CHANGE_VP":
      //   return this.processChangeViewPortRequest(requestId, body, session);
      // case "SELECT_ROW":
      //   return this.processSelectRowRequest(requestId, body, session);
      // case "DESELECT_ROW":
      //   return this.processDeselectRowRequest(requestId, body, session);
      // case "SELECT_ROW_RANGE":
      //   return this.processSelectRowRangeRequest(requestId, body, session);
      // case "RPC_REQUEST":
      //   return this.handleViewportRpcRequest(requestId, body, ctx, session);
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
    const table = this.tableContainer.getTable(msg.table.table);
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
      throw Error(
        `[VUU:core:CoreServerApiHandler] GET_TABLE_META no table found ${JSON.stringify(
          msg.table,
        )}`,
      );
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
        `[CoreServerApi] created viewport ${viewport.id} on tbale ${tableName}`,
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
      errorMsg(`Failed to process request ${ctx.requestId}`, ctx);
    }
  }

  //--------------------------------------------------

  private processRemoveViewPortRequest(
    requestId: string,
    { viewPortId }: VuuViewportRemoveRequest,
    session: ISession,
  ) {
    this.viewPortContainer.removeViewport(viewPortId);
    session.removeViewport(viewPortId);

    session.enqueue(requestId, {
      type: "REMOVE_VP_SUCCESS",
      viewPortId,
    });
  }
  private processDisableViewPortRequest(
    requestId: string,
    { viewPortId }: VuuViewportDisableRequest,
    session: ISession,
  ) {
    try {
      this.viewPortContainer.disableViewport(viewPortId);
      // session.removeViewport(viewPortId);

      session.enqueue(requestId, {
        type: "DISABLE_VP_SUCCESS",
        viewPortId,
      });
    } catch (e) {
      throw e;
      // session.enqueue(requestId, {
      //   type: "DISABLE_VP_REJECT",
      //   viewPortId,
      // });
    }
  }
  private processEnableViewPortRequest(
    requestId: string,
    { viewPortId }: VuuViewportEnableRequest,
    session: ISession,
  ) {
    try {
      this.viewPortContainer.enableViewport(viewPortId);
      // session.removeViewport(viewPortId);

      session.enqueue(requestId, {
        type: "ENABLE_VP_SUCCESS",
        viewPortId,
      });
    } catch (e) {
      throw e;
      // session.enqueue(requestId, {
      //   type: "ENABLE_VP_REJECT",
      //   viewPortId,
      // });
    }
  }

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

  private processChangeViewPortRequest(
    requestId: string,
    { viewPortId, ...options }: VuuViewportChangeRequest,
    session: ISession,
  ) {
    session.enqueue(requestId, {
      ...options,
      type: "CHANGE_VP_SUCCESS",
      viewPortId,
    });

    const viewport = this.viewPortContainer.getViewportById(viewPortId);
    if (viewport) {
      const dataResponse = viewport.changeViewport(options);
      if (dataResponse) {
        const { rows, size, sizeMessageRequired = false } = dataResponse;
        session.enqueue(
          "",
          tableRowsMessageBody(rows, size, viewport.id, sizeMessageRequired),
        );
      }
    }
  }

  private processSelectRowRequest(
    requestId: string,
    { preserveExistingSelection, rowKey, vpId }: SelectRowRequest,
    session: ISession,
  ) {
    const { rows, selectedRowCount, size } = this.viewPortContainer.selectRow(
      vpId,
      rowKey,
      preserveExistingSelection,
    );
    session.enqueue(requestId, {
      selectedRowCount,
      type: "SELECT_ROW_SUCCESS",
      vpId,
    });

    session.enqueue("", tableRowsMessageBody(rows, size, vpId, false));
  }

  private processDeselectRowRequest(
    requestId: string,
    { preserveExistingSelection, rowKey, vpId }: DeselectRowRequest,
    session: ISession,
  ) {
    const { rows, selectedRowCount, size } = this.viewPortContainer.deselectRow(
      vpId,
      rowKey,
      preserveExistingSelection,
    );
    session.enqueue(requestId, {
      selectedRowCount,
      type: "DESELECT_ROW_SUCCESS",
      vpId,
    });

    session.enqueue("", tableRowsMessageBody(rows, size, vpId, false));
  }

  private processSelectRowRangeRequest(
    requestId: string,
    {
      preserveExistingSelection,
      fromRowKey,
      toRowKey,
      vpId,
    }: SelectRowRangeRequest,
    session: ISession,
  ) {
    const { rows, selectedRowCount, size } =
      this.viewPortContainer.selectRowRange(
        vpId,
        fromRowKey,
        toRowKey,
        preserveExistingSelection,
      );
    session.enqueue(requestId, {
      selectedRowCount,
      type: "SELECT_ROW_SUCCESS",
      vpId,
    });

    session.enqueue("", tableRowsMessageBody(rows, size, vpId, false));
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
  private handleViewportRpcRequest(
    requestId: string,
    rpcRequest: VuuRpcServiceRequest,
    ctx: RequestContext,
    session: ISession,
  ) {
    const { rpcName } = rpcRequest;

    if (hasViewPortContext(rpcRequest)) {
      const result = this.viewPortContainer.handleRpcRequest(
        rpcRequest.context.viewPortId,
        rpcName,
        rpcRequest.params,
        ctx,
      );

      session.enqueue(requestId, {
        action: { type: "VP_RPC_SUCCESS" },
        error: null,
        type: "RPC_RESPONSE",
        result: {
          data: result,
          type: "SUCCESS_RESULT",
        },
        rpcName,
      });
    }
  }
}
