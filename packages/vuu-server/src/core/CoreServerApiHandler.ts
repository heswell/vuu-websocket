import {
  ClientToServerMenuSelectRPC,
  DeselectRowRequest,
  SelectRowRangeRequest,
  SelectRowRequest,
  VuuClientMessage,
  VuuCreateVisualLink,
  VuuRemoveVisualLink,
  VuuRpcServiceRequest,
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
import logger from "../logger.ts";

export class CoreServerApiHandler {
  constructor(
    private viewPortContainer: ViewportContainer,
    private tableContainer: TableContainer,
    private providerContainer: ProviderContainer
  ) {}

  process(
    { requestId, body }: VuuClientMessage | VuuClientMessage,
    session: ISession
  ) {
    switch (body.type) {
      case "GET_TABLE_LIST":
        session.enqueue(requestId, {
          type: "TABLE_LIST_RESP",
          tables: this.tableContainer.getDefinedTables(),
        });
        break;
      case "GET_TABLE_META":
        return this.processGetTableMetaRequest(requestId, body, session);
      case "CREATE_VP":
        return this.processCreateViewPortRequest(requestId, body, session);
      case "REMOVE_VP":
        return this.processRemoveViewPortRequest(requestId, body, session);
      case "DISABLE_VP":
        return this.processDisableViewPortRequest(requestId, body, session);
      case "ENABLE_VP":
        return this.processEnableViewPortRequest(requestId, body, session);
      case "CREATE_VISUAL_LINK":
        return this.processCreateVisualLinkRequest(requestId, body, session);
      case "REMOVE_VISUAL_LINK":
        return this.processRemoveVisualLinkRequest(requestId, body, session);
      case "CHANGE_VP":
        return this.processChangeViewPortRequest(requestId, body, session);
      case "SELECT_ROW":
        return this.processSelectRowRequest(requestId, body, session);
      case "DESELECT_ROW":
        return this.processDeselectRowRequest(requestId, body, session);
      case "SELECT_ROW_RANGE":
        return this.processSelectRowRangeRequest(requestId, body, session);
      case "GET_VP_VISUAL_LINKS":
        return this.processGetViewPortVisualLinksRequest(
          requestId,
          body,
          session
        );
      case "GET_VIEW_PORT_MENUS":
        return this.processGetViewPortMenusRequest(requestId, body, session);
      case "CHANGE_VP_RANGE":
        logger.info({ requestId }, `CHANGE_VP_RANGE ${body.from}:${body.to}`);
        return this.processViewPortRange(requestId, body, session);
      case "RPC_REQUEST":
        return this.processRpcRequest(requestId, body, session);
      case "VIEW_PORT_MENUS_SELECT_RPC":
        return this.processViewPortMenuSelectionRpcCall(
          requestId,
          body,
          session
        );
      default:
        throw Error(
          `[VUU:core:CoreServerApiHandler] unsupported message type ${body.type}`
        );
    }
  }

  private processGetTableMetaRequest(
    requestId: string,
    body: VuuTableMetaRequest,
    session: ISession
  ) {
    const table = this.tableContainer.getTable(body.table.table);
    if (table) {
      const viewPortDef = this.viewPortContainer.getViewPortDefinition(table);
      session.enqueue(requestId, {
        type: "TABLE_META_RESP",
        columns: viewPortDef.columns.map((col) => col.name),
        dataTypes: viewPortDef.columns.map((col) => col.dataType),
        key: table.tableDef.keyField,
        table: body.table,
      });
    } else {
      throw Error(
        `[VUU:core:CoreServerApiHandler] GET_TABLE_META no table found ${JSON.stringify(
          body.table
        )}`
      );
    }
  }

  private processGetViewPortMenusRequest(
    requestId: string,
    { vpId }: VuuViewportMenusRequest,
    session: ISession
  ) {
    const viewPort = this.viewPortContainer.getViewportById(vpId);

    session.enqueue(requestId, {
      type: "VIEW_PORT_MENUS_RESP",
      menu: viewPort.viewPortDef.service.menuItems.asJson,
      vpId,
    });
  }

  private processCreateViewPortRequest(
    requestId: string,
    body: VuuViewportCreateRequest,
    session: ISession
  ) {
    const { table: vuuTable } = body;
    const table = this.tableContainer.getTable(vuuTable.table);

    const viewport = this.viewPortContainer.createViewport(
      session,
      table,
      body
    );
    // why do we need this ?
    session.addViewport(viewport.id);

    session.enqueue(requestId, {
      ...body,
      table: table.name,
      type: "CREATE_VP_SUCCESS",
      viewPortId: viewport.id,
    });

    const { rows, size } = viewport.getDataForCurrentRange();
    session.enqueue("", tableRowsMessageBody(rows, size, viewport.id, true));
  }

  private processRemoveViewPortRequest(
    requestId: string,
    { viewPortId }: VuuViewportRemoveRequest,
    session: ISession
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
    session: ISession
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
    session: ISession
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
    session: ISession
  ) {
    this.viewPortContainer.linkViewPorts(
      childVpId,
      parentVpId,
      childColumnName,
      parentColumnName
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
    session: ISession
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
    session: ISession
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
          tableRowsMessageBody(rows, size, viewport.id, sizeMessageRequired)
        );
      }
    }
  }

  private processViewPortRange(
    requestId: string,
    { from, to, viewPortId }: VuuViewportRangeRequest,
    session: ISession
  ) {
    // should be purge the queue of any pending updates outside the requested range ?
    session.enqueue(requestId, {
      from,
      to,
      type: "CHANGE_VP_RANGE_SUCCESS",
      viewPortId,
    });

    const viewport = this.viewPortContainer.getViewportById(viewPortId);
    if (viewport) {
      const { rows, size } = viewport.setRange({ from, to });
      session.enqueue("", tableRowsMessageBody(rows, size, viewport.id, false));
    } else {
      throw Error(`[VuuProtocolHandler] no viewport for id #${viewPortId}`);
    }
  }

  private processSelectRowRequest(
    requestId: string,
    { preserveExistingSelection, rowKey, vpId }: SelectRowRequest,
    session: ISession
  ) {
    const { rows, selectedRowCount, size } = this.viewPortContainer.selectRow(
      vpId,
      rowKey,
      preserveExistingSelection
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
    session: ISession
  ) {
    const { rows, selectedRowCount, size } = this.viewPortContainer.deselectRow(
      vpId,
      rowKey,
      preserveExistingSelection
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
    session: ISession
  ) {
    const { rows, selectedRowCount, size } =
      this.viewPortContainer.selectRowRange(
        vpId,
        fromRowKey,
        toRowKey,
        preserveExistingSelection
      );
    session.enqueue(requestId, {
      selectedRowCount,
      type: "SELECT_ROW_SUCCESS",
      vpId,
    });

    session.enqueue("", tableRowsMessageBody(rows, size, vpId, false));
  }

  private processGetViewPortVisualLinksRequest(
    requestId: string,
    { vpId }: VuuViewportVisualLinksRequest,
    session: ISession
  ) {
    const links = this.viewPortContainer.getViewPortVisualLinks(vpId);
    session.enqueue(requestId, {
      links,
      type: "VP_VISUAL_LINKS_RESP",
      vpId,
    });
  }

  private processViewPortMenuSelectionRpcCall(
    requestId: string,
    { vpId, rpcName }: ClientToServerMenuSelectRPC,
    session: ISession
  ) {
    const action = this.viewPortContainer.callRpcSelection(
      vpId,
      rpcName,
      session.id
    );

    session.enqueue(requestId, {
      action,
      rpcName,
      type: "VIEW_PORT_MENU_RESP",
      vpId,
    });
  }
  private processRpcRequest(
    requestId: string,
    rpcRequest: VuuRpcServiceRequest,
    session: ISession
  ) {
    const { rpcName } = rpcRequest;

    if (hasViewPortContext(rpcRequest)) {
      const result = this.viewPortContainer.handleRpcRequest(
        rpcRequest.context.viewPortId,
        rpcName,
        rpcRequest.params
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
