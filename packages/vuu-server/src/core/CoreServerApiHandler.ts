import {
  ClientToServerMenuSelectRPC,
  ClientToServerSelection,
  VuuClientMessage,
  VuuRpcServiceRequest,
  VuuRpcViewportRequest,
  VuuTableMetaRequest,
  VuuViewportChangeRequest,
  VuuViewportCreateRequest,
  VuuViewportMenusRequest,
  VuuViewportRangeRequest,
} from "@vuu-ui/vuu-protocol-types";
import { ProviderContainer } from "../provider/ProviderContainer";
import { ViewportContainer } from "../viewport/ViewportContainer";
import { TableContainer } from "./table/TableContainer";
import { ISession } from "../server-types";
import { tableRowsMessageBody } from "@heswell/data";
import { hasViewPortContext, isViewportRpcRequest } from "@vuu-ui/vuu-utils";

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
      case "CHANGE_VP":
        return this.processChangeViewPortRequest(requestId, body, session);
      case "SET_SELECTION":
        return this.processSetSelectionRequest(requestId, body, session);
      case "GET_VP_VISUAL_LINKS":
        console.log(
          `[VUU:core:CoreServerApiHandler] not yet implemented ${body.type}`
        );
        break;
      case "GET_VIEW_PORT_MENUS":
        return this.processGetViewPortMenusRequest(requestId, body, session);
      case "CHANGE_VP_RANGE":
        return this.processViewPortRange(requestId, body, session);
      case "RPC_REQUEST":
        return this.processRpcRequest(requestId, body, session);
      case "VIEW_PORT_RPC_CALL":
        return this.processViewPortRpcRequest(requestId, body, session);
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
      menu: viewPort.viewPortDef.service.menuItems,
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

  private processSetSelectionRequest(
    requestId: string,
    { selection, vpId }: ClientToServerSelection,
    session: ISession
  ) {
    session.enqueue(requestId, {
      selection,
      type: "SET_SELECTION_SUCCESS",
      vpId,
    });
    const viewport = this.viewPortContainer.getViewportById(vpId);
    const { rows, size } = viewport.select(selection);
    session.enqueue("", tableRowsMessageBody(rows, size, viewport.id, false));
  }

  private processViewPortMenuSelectionRpcCall(
    requestId: string,
    body: ClientToServerMenuSelectRPC,
    session: ISession
  ) {
    console.log(`menu select invoked`, {
      body,
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
  private processViewPortRpcRequest(
    requestId: string,
    { namedParams, params, rpcName, vpId }: VuuRpcViewportRequest,
    session: ISession
  ) {
    const result = this.viewPortContainer.handleRpcRequest(
      vpId,
      rpcName,
      namedParams
    );

    session.enqueue(requestId, {
      action: { type: "VP_RPC_SUCCESS", result },
      type: "VIEW_PORT_RPC_REPONSE",
      namedParams,
      params,
      result,
      rpcName,
      vpId,
    });
  }
}
