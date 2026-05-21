import { RpcResult } from "@vuu-ui/vuu-protocol-types";
import { TableContainer } from "../../core/table/TableContainer";
import { EditTableRpcHandler } from "./EditTableRpcHandler";
import { RpcParams } from "./Rpc";

export class EditSessionRpcHandler extends EditTableRpcHandler {
  beginEditSession = ({ namedParams, viewport, ctx }: RpcParams): RpcResult => {
    console.log(
      `beginEditSession ${JSON.stringify(namedParams)} ${JSON.stringify(namedParams)}`,
    );

    const baseTable = viewport.dataTable;
    const sessionTable = this.tableContainer.createSimpleSessionTable(
      baseTable,
      ctx.session,
    );
    const { module } = sessionTable.schema.table;
    return {
      type: "SUCCESS_RESULT",
      data: {
        table: { module, table: sessionTable.name },
      },
    };
  };

  constructor(tableContainer: TableContainer) {
    super(tableContainer);
    console.log(`rpc service available: beginEditSession`);
    this.registerRpc("beginEditSession", this.beginEditSession);
  }
}
